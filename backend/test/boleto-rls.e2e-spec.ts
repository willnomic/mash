import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedInvoiceScenario } from './helpers/seed-invoice-scenario.js';

// Roda contra o PostgreSQL real do docker-compose — D-042: registro do
// boleto emitido no banco da transportadora (revisão da D-025), não
// emissão. RLS/CHECK/GRANT são do banco.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Attachment", "ReceivableEvent", "Boleto", "Invoice", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;

async function seedBoleto(
  seed: Awaited<ReturnType<typeof seedInvoiceScenario>>,
  number: string,
  amount: string,
) {
  return admin.boleto.create({
    data: {
      id: uuidv7(),
      tenantId: seed.tenant.id,
      invoiceId: seed.invoice.id,
      number,
      dueDate: new Date('2026-10-10'),
      amount,
      digitableLine: '34191.79001 01043.510047 91020.150008 1 96380000015000',
    },
  });
}

describe('Boleto · Row-Level Security e imutabilidade (D-042)', () => {
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

  it('não enxerga boleto de outro tenant', async () => {
    await seedBoleto(a, '1', '1500');
    await seedBoleto(b, '1', '2000');

    const boletos = await forTenant(a.tenant.id).boleto.findMany();

    expect(boletos).toHaveLength(1);
    expect(boletos[0].tenantId).toBe(a.tenant.id);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).boleto.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          invoiceId: b.invoice.id,
          number: '1',
          dueDate: new Date('2026-10-10'),
          amount: '1500',
          digitableLine: '34191.79001 01043.510047 91020.150008 1 96380000015000',
        },
      }),
    ).rejects.toThrow();
  });

  it('aceita mais de um boleto pra mesma fatura (1:N, mesmo critério de TollVoucherPurchase)', async () => {
    await seedBoleto(a, '1', '750');
    await seedBoleto(a, '2', '750');

    const boletos = await forTenant(a.tenant.id).boleto.findMany({
      where: { invoiceId: a.invoice.id },
    });

    expect(boletos).toHaveLength(2);
  });

  it('recusa valor zero ou negativo', async () => {
    await expect(seedBoleto(a, '1', '0')).rejects.toThrow();
    await expect(seedBoleto(a, '1', '-100')).rejects.toThrow();
  });

  it('impede UPDATE — registro é imutável, corrigir é linha nova', async () => {
    const boleto = await seedBoleto(a, '1', '1500');

    await expect(
      forTenant(a.tenant.id).boleto.update({
        where: { id: boleto.id },
        data: { amount: '9999' },
      }),
    ).rejects.toThrow();
  });

  it('impede DELETE', async () => {
    const boleto = await seedBoleto(a, '1', '1500');

    await expect(
      forTenant(a.tenant.id).boleto.delete({ where: { id: boleto.id } }),
    ).rejects.toThrow();
  });
});
