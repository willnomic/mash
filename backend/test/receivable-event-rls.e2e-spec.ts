import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedInvoiceScenario } from './helpers/seed-invoice-scenario.js';

// Roda contra o PostgreSQL real do docker-compose — D-042: livro de
// eventos append-only do recebível, mesmo desenho de CarrierPayment
// (D-032), do outro lado do caixa. RLS/CHECK/GRANT são do banco.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Attachment", "ReceivableEvent", "Boleto", "Invoice", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;

async function seedPayment(
  seed: Awaited<ReturnType<typeof seedInvoiceScenario>>,
  amount: string,
) {
  return admin.receivableEvent.create({
    data: {
      id: uuidv7(),
      tenantId: seed.tenant.id,
      invoiceId: seed.invoice.id,
      type: 'PAYMENT',
      amount,
      paymentDate: new Date('2026-10-05'),
      paymentMethod: 'PIX',
    },
  });
}

describe('ReceivableEvent · Row-Level Security, imutabilidade e estorno (D-042)', () => {
  let a: Awaited<ReturnType<typeof seedInvoiceScenario>>;
  let b: Awaited<ReturnType<typeof seedInvoiceScenario>>;

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    a = await seedInvoiceScenario(admin, 'A', 'transportadora-a');
    b = await seedInvoiceScenario(admin, 'B', 'transportadora-b');
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga evento de outro tenant', async () => {
    await seedPayment(a, '500');
    await seedPayment(b, '700');

    const events = await forTenant(a.tenant.id).receivableEvent.findMany();

    expect(events).toHaveLength(1);
    expect(events[0].tenantId).toBe(a.tenant.id);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).receivableEvent.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          invoiceId: b.invoice.id,
          type: 'PAYMENT',
          amount: '500',
          paymentDate: new Date('2026-10-05'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa valor zero ou negativo', async () => {
    await expect(seedPayment(a, '0')).rejects.toThrow();
    await expect(seedPayment(a, '-1')).rejects.toThrow();
  });

  it('CHECK amarra REVERSAL a reversesReceivableEventId, nos dois sentidos', async () => {
    const payment = await seedPayment(a, '500');

    // PAYMENT com reversesReceivableEventId preenchido — recusado.
    await expect(
      admin.receivableEvent.create({
        data: {
          id: uuidv7(),
          tenantId: a.tenant.id,
          invoiceId: a.invoice.id,
          type: 'PAYMENT',
          amount: '100',
          reversesReceivableEventId: payment.id,
          paymentDate: new Date('2026-10-06'),
        },
      }),
    ).rejects.toThrow();

    // REVERSAL sem reversesReceivableEventId — recusado.
    await expect(
      admin.receivableEvent.create({
        data: {
          id: uuidv7(),
          tenantId: a.tenant.id,
          invoiceId: a.invoice.id,
          type: 'REVERSAL',
          amount: '500',
          paymentDate: new Date('2026-10-06'),
        },
      }),
    ).rejects.toThrow();

    // REVERSAL com reversesReceivableEventId — aceito.
    await expect(
      admin.receivableEvent.create({
        data: {
          id: uuidv7(),
          tenantId: a.tenant.id,
          invoiceId: a.invoice.id,
          type: 'REVERSAL',
          amount: '500',
          reversesReceivableEventId: payment.id,
          paymentDate: new Date('2026-10-06'),
        },
      }),
    ).resolves.toBeTruthy();
  });

  it('impede estornar o mesmo evento duas vezes', async () => {
    const payment = await seedPayment(a, '500');
    await admin.receivableEvent.create({
      data: {
        id: uuidv7(),
        tenantId: a.tenant.id,
        invoiceId: a.invoice.id,
        type: 'REVERSAL',
        amount: '500',
        reversesReceivableEventId: payment.id,
        paymentDate: new Date('2026-10-06'),
      },
    });

    await expect(
      admin.receivableEvent.create({
        data: {
          id: uuidv7(),
          tenantId: a.tenant.id,
          invoiceId: a.invoice.id,
          type: 'REVERSAL',
          amount: '500',
          reversesReceivableEventId: payment.id,
          paymentDate: new Date('2026-10-07'),
        },
      }),
    ).rejects.toThrow();
  });

  it('impede UPDATE — livro append-only, correção é REVERSAL', async () => {
    const payment = await seedPayment(a, '500');

    await expect(
      forTenant(a.tenant.id).receivableEvent.update({
        where: { id: payment.id },
        data: { amount: '999' },
      }),
    ).rejects.toThrow();
  });

  it('impede DELETE', async () => {
    const payment = await seedPayment(a, '500');

    await expect(
      forTenant(a.tenant.id).receivableEvent.delete({ where: { id: payment.id } }),
    ).rejects.toThrow();
  });

  it('saldo por SUM de eventos, sem estorno — quanto falta receber é order.total menos pagamentos', async () => {
    // order.total do cenário (seed-order-scenario) é '500'.
    await seedPayment(a, '200');

    const order = await forTenant(a.tenant.id).order.findFirstOrThrow({
      where: { invoiceId: a.invoice.id },
    });
    const paid = await forTenant(a.tenant.id).receivableEvent.aggregate({
      where: { invoiceId: a.invoice.id, type: 'PAYMENT' },
      _sum: { amount: true },
    });

    const balance = order.total.minus(paid._sum.amount ?? new Prisma.Decimal(0));

    expect(balance.toString()).toBe('300');
  });

  it('saldo por SUM de eventos, com estorno — pagamento estornado volta a compor o saldo devedor', async () => {
    const payment = await seedPayment(a, '200');
    await admin.receivableEvent.create({
      data: {
        id: uuidv7(),
        tenantId: a.tenant.id,
        invoiceId: a.invoice.id,
        type: 'REVERSAL',
        amount: '200',
        reversesReceivableEventId: payment.id,
        paymentDate: new Date('2026-10-06'),
      },
    });

    const order = await forTenant(a.tenant.id).order.findFirstOrThrow({
      where: { invoiceId: a.invoice.id },
    });
    const events = await forTenant(a.tenant.id).receivableEvent.findMany({
      where: { invoiceId: a.invoice.id },
    });

    // Soma sinalizada à mão (D-013: .plus()/.minus(), nunca operador
    // nativo) — PAYMENT reduz o saldo devedor, REVERSAL desfaz isso.
    const received = events.reduce((sum, event) => {
      if (event.type === 'PAYMENT') return sum.plus(event.amount);
      if (event.type === 'REVERSAL') return sum.minus(event.amount);
      return sum;
    }, new Prisma.Decimal(0));
    const balance = order.total.minus(received);

    // O pagamento foi estornado — o saldo devedor volta a ser o total
    // cheio do pedido, não os 300 que sobrariam se o estorno não
    // existisse.
    expect(received.toString()).toBe('0');
    expect(balance.toString()).toBe(order.total.toString());
  });
});
