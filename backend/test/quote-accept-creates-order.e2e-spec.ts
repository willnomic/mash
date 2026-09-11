import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureQuoteCostTypesSeeded } from './helpers/seed-quote-cost-types.js';
import { ensureOrderStatusesSeeded } from './helpers/seed-order-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { QuoteService } from '../src/quote/quote.service.js';
import { TaxRateService } from '../src/tax-rate/tax-rate.service.js';
import { TenantPrisma } from '../src/tenant/tenant-prisma.service.js';
import { OrderService, type OrderParties } from '../src/order/order.service.js';
import { NumberingService } from '../src/numbering/numbering.service.js';

// Roda contra o PostgreSQL real do docker-compose — unidade "caminho
// CUSTO → Order" (o aceite da cotação cria o pedido). Evidência real:
// e-mail cotando 4 contêineres com lacre individual, planilha com um
// processo de 5 caminhões (CT-e 7581-7585).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function tenantPrismaFor(tenantId: string): TenantPrisma {
  const fakeCls = { get: () => tenantId } as unknown as ClsService;
  return new TenantPrisma(fakeCls);
}

const TRUNCATE = `TRUNCATE TABLE "Trip", "Order", "QuoteCostLine", "Quote", "QuoteCostType", "FreightRate", "Lane", "Party", "Branch", "Tenant" CASCADE`;

describe('Quote · caminho CUSTO → Order (accept() cria o pedido)', () => {
  let tenant: { id: string };
  let branch: { id: string };
  let party: { id: string };
  let quoteService: QuoteService;
  let freightTypeId: string;

  function orderInput(): OrderParties {
    return {
      branchId: branch.id,
      senderId: party.id,
      recipientId: party.id,
      tomadorId: party.id,
    };
  }

  async function createClosedCostBasedQuote(quantity?: number) {
    const quote = await quoteService.createCostBased({
      partyId: party.id,
      icmsUf: 'SP',
      marginPercentage: '20',
      costLines: [{ costTypeId: freightTypeId, amount: '810' }],
    });
    return quoteService.close(quote.id, { quantity });
  }

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);
    await ensureOrderStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);

    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    branch = await admin.branch.create({
      data: { id: uuidv7(), tenantId: tenant.id, name: 'Matriz' },
    });
    party = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Águia Translog',
        cnpj: '11444777000161',
      },
    });
    freightTypeId = (
      await admin.quoteCostType.findFirstOrThrow({ where: { code: 'FREIGHT' } })
    ).id;

    const tenantPrisma = tenantPrismaFor(tenant.id);
    quoteService = new QuoteService(
      tenantPrisma,
      new TaxRateService(),
      new OrderService(tenantPrisma, new NumberingService()),
    );
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);
    await ensureOrderStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('quantidade 4 → 1 Order, 4 Trip, preço unitário (Quote.total) em cada', async () => {
    const closed = await createClosedCostBasedQuote(4);

    const order = await quoteService.accept(closed.id, orderInput());

    const orders = await forTenant(tenant.id).order.findMany({
      where: { quoteId: closed.id },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(order.id);

    const trips = await forTenant(tenant.id).trip.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: 'asc' },
    });
    expect(trips).toHaveLength(4);
    expect(trips.map((t) => t.sequence)).toEqual([1, 2, 3, 4]);
    for (const trip of trips) {
      expect(trip.price?.toString()).toBe(closed.total?.toString());
      expect(trip.driverId).toBeNull();
      expect(trip.vehicleId).toBeNull();
      expect(trip.destinationAddressId).toBeNull();
    }
  });

  it('quantidade 1 (default, sem informar) → 1 Trip', async () => {
    const closed = await createClosedCostBasedQuote();
    expect(closed.quantity).toBe(1);

    const order = await quoteService.accept(closed.id, orderInput());

    const trips = await forTenant(tenant.id).trip.findMany({
      where: { orderId: order.id },
    });
    expect(trips).toHaveLength(1);
    expect(trips[0].sequence).toBe(1);
  });

  it('caminho TABELA segue funcionando — mesmos campos que createFromQuote() sempre produziu (regressão)', async () => {
    const lane = await admin.lane.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        originCity: 'São Paulo',
        originState: 'SP',
        destinationCity: 'Curitiba',
        destinationState: 'PR',
      },
    });
    const freightRate = await admin.freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        partyId: party.id,
        laneId: lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('9999-12-31'),
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });
    const quote = await quoteService.create({
      freightRateId: freightRate.id,
      total: '600',
    });
    const closed = await quoteService.close(quote.id);

    const order = await quoteService.accept(closed.id, orderInput());

    expect(order.quoteId).toBe(quote.id);
    expect(order.freightRateId).toBe(freightRate.id);
    expect(order.rate?.toString()).toBe('150.5');
    expect(order.minimumFreight?.toString()).toBe('500');
    expect(order.additionalPercentage?.toString()).toBe('2.5');
    expect(order.total.toString()).toBe('600');

    const trips = await forTenant(tenant.id).trip.findMany({
      where: { orderId: order.id },
    });
    expect(trips).toHaveLength(1);
    expect(trips[0].price?.toString()).toBe('600');
  });

  it('cotação vencida continua recusada e NÃO cria Order (D-046)', async () => {
    const quote = await quoteService.createCostBased({
      partyId: party.id,
      icmsUf: 'SP',
      marginPercentage: '20',
      costLines: [{ costTypeId: freightTypeId, amount: '810' }],
    });
    const closed = await quoteService.close(quote.id, {
      validityTerm: { unit: 'DAYS', amount: -1 },
    });

    await expect(
      quoteService.accept(closed.id, orderInput()),
    ).rejects.toThrow(/vencida/);

    const orders = await forTenant(tenant.id).order.findMany({
      where: { quoteId: closed.id },
    });
    expect(orders).toHaveLength(0);
  });

  it('segundo aceite continua recusado e não cria segundo Order', async () => {
    const closed = await createClosedCostBasedQuote(2);
    const order = await quoteService.accept(closed.id, orderInput());

    await expect(
      quoteService.accept(closed.id, orderInput()),
    ).rejects.toThrow(/já tem desfecho/);

    const orders = await forTenant(tenant.id).order.findMany({
      where: { quoteId: closed.id },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(order.id);
  });

  it('falha no meio da criação não deixa cotação aceita sem pedido (transação)', async () => {
    const closed = await createClosedCostBasedQuote(3);

    // branchId inexistente — FK falha na criação do Order, no MEIO da
    // transação (depois do UPDATE que já teria marcado a Quote como
    // ACCEPTED, se não fosse a mesma transação).
    await expect(
      quoteService.accept(closed.id, {
        ...orderInput(),
        branchId: uuidv7(),
      }),
    ).rejects.toThrow();

    const quoteAfter = await admin.quote.findUniqueOrThrow({
      where: { id: closed.id },
    });
    const closedStatus = await admin.quoteStatus.findFirstOrThrow({
      where: { code: 'CLOSED' },
    });
    expect(quoteAfter.statusId).toBe(closedStatus.id);

    const orders = await forTenant(tenant.id).order.findMany({
      where: { quoteId: closed.id },
    });
    expect(orders).toHaveLength(0);
    const trips = await forTenant(tenant.id).trip.findMany({});
    expect(trips).toHaveLength(0);
  });

  // Diferente das guardas de accept() (não dá pra garantir no banco,
  // D-046): "uma Quote produz no máximo um Order" o banco CONSEGUE
  // garantir — testado por fora do serviço, direto no banco, como o
  // CHECK de caminho exclusivo da D-041.
  it('UNIQUE recusa um segundo Order pra mesma Quote, direto no banco', async () => {
    const closed = await createClosedCostBasedQuote();
    await quoteService.accept(closed.id, orderInput());

    await expect(
      admin.order.create({
        data: {
          id: uuidv7(),
          tenantId: tenant.id,
          branchId: branch.id,
          number: 999,
          statusId: (
            await admin.orderStatus.findFirstOrThrow({
              where: { code: 'IN_PROGRESS' },
            })
          ).id,
          quoteId: closed.id,
          senderId: party.id,
          recipientId: party.id,
          tomadorId: party.id,
          total: closed.total ?? '0',
        },
      }),
    ).rejects.toThrow();
  });

  // CHECK "Order_pricing_path_exclusive" (mesmo mecanismo do
  // Quote_pricing_path_exclusive, D-041) — testado por fora do serviço,
  // não só confiando que accept()/createFromQuote() sempre montam o
  // Order do jeito certo.
  it('CHECK do banco recusa Order com os dois caminhos de preço misturados', async () => {
    const lane = await admin.lane.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        originCity: 'São Paulo',
        originState: 'SP',
        destinationCity: 'Curitiba',
        destinationState: 'PR',
      },
    });
    const freightRate = await admin.freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        partyId: party.id,
        laneId: lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('9999-12-31'),
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });
    const inProgressStatus = await admin.orderStatus.findFirstOrThrow({
      where: { code: 'IN_PROGRESS' },
    });

    // freightRateId+rate preenchidos (caminho TABELA) mas
    // minimumFreight/additionalPercentage nulos (caminho CUSTO) — os
    // dois caminhos misturados na mesma linha.
    await expect(
      admin.order.create({
        data: {
          id: uuidv7(),
          tenantId: tenant.id,
          branchId: branch.id,
          number: 998,
          statusId: inProgressStatus.id,
          senderId: party.id,
          recipientId: party.id,
          tomadorId: party.id,
          freightRateId: freightRate.id,
          rate: '150.5',
          total: '600',
        },
      }),
    ).rejects.toThrow();
  });
});
