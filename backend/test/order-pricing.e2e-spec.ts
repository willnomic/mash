import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { OrderService } from '../src/order/order.service.js';
import { QuoteService } from '../src/quote/quote.service.js';
import { TenantPrisma } from '../src/tenant/tenant-prisma.service.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia provada
// aqui (congelamento, imutabilidade) é do banco e do serviço juntos, não
// dá pra mockar. TenantPrisma normalmente lê o tenant do ClsService (via
// guard, D-012 Passo 4); aqui é um double mínimo, só pra não precisar
// subir a aplicação inteira — a leitura/escrita no banco continua real.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function tenantPrismaFor(tenantId: string): TenantPrisma {
  const fakeCls = { get: () => tenantId } as unknown as ClsService;
  return new TenantPrisma(fakeCls);
}

async function seedTenant(name: string, slug: string) {
  const tenant = await admin.tenant.create({
    data: { id: uuidv7(), name, slug },
  });
  const branch = await admin.branch.create({
    data: { id: uuidv7(), tenantId: tenant.id, name: 'Matriz' },
  });
  const party = await admin.party.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      personType: 'COMPANY',
      name: `Cliente ${name}`,
      cnpj: '11444777000161',
    },
  });
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
  return { tenant, branch, party, lane };
}

describe('Quote/Order · congelamento de valor e imutabilidade (D-014, D-018)', () => {
  let seed: Awaited<ReturnType<typeof seedTenant>>;
  let quoteService: QuoteService;
  let orderService: OrderService;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "Quote", "FreightRate", "Lane", "Party", "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    seed = await seedTenant('A', 'transportadora-a');
    const tenantPrisma = tenantPrismaFor(seed.tenant.id);
    quoteService = new QuoteService(tenantPrisma);
    orderService = new OrderService(tenantPrisma);
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "Quote", "FreightRate", "Lane", "Party", "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  async function createFreightRate(rate: string, validFrom: string, validTo: string) {
    return admin.freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        partyId: seed.party.id,
        laneId: seed.lane.id,
        validFrom: new Date(validFrom),
        validTo: new Date(validTo),
        rate,
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });
  }

  it('caminho 1: via Quote fechada — Order copia os valores já congelados nela', async () => {
    const freightRate = await createFreightRate('100', '2026-01-01', '9999-12-31');

    const quote = await quoteService.create({
      freightRateId: freightRate.id,
      total: '600',
    });
    await quoteService.close(quote.id);

    const order = await orderService.createFromQuote({
      quoteId: quote.id,
      branchId: seed.branch.id,
      senderId: seed.party.id,
      recipientId: seed.party.id,
      tomadorId: seed.party.id,
    });

    expect(order.quoteId).toBe(quote.id);
    expect(order.freightRateId).toBe(freightRate.id);
    expect(order.rate.toString()).toBe('100');
    expect(order.total.toString()).toBe('600');
  });

  it('caminho 2: sem Quote — consulta a FreightRate na criação e já congela', async () => {
    const freightRate = await createFreightRate('200', '2026-01-01', '9999-12-31');

    const order = await orderService.createFromFreightRate({
      freightRateId: freightRate.id,
      branchId: seed.branch.id,
      senderId: seed.party.id,
      recipientId: seed.party.id,
      tomadorId: seed.party.id,
      total: '900',
    });

    expect(order.quoteId).toBeNull();
    expect(order.freightRateId).toBe(freightRate.id);
    expect(order.rate.toString()).toBe('200');
    expect(order.total.toString()).toBe('900');
  });

  it('valor congelado não muda quando a FreightRate de origem é fechada e substituída', async () => {
    const originalRate = await createFreightRate('100', '2026-01-01', '9999-12-31');

    const order = await orderService.createFromFreightRate({
      freightRateId: originalRate.id,
      branchId: seed.branch.id,
      senderId: seed.party.id,
      recipientId: seed.party.id,
      tomadorId: seed.party.id,
      total: '500',
    });

    // Fecha a linha original (único UPDATE permitido, GRANT por coluna) e
    // abre uma nova com tarifa diferente para o mesmo tenant+party+lane.
    await forTenant(seed.tenant.id).freightRate.update({
      where: { id: originalRate.id },
      data: { validTo: new Date('2026-07-01') },
    });
    await createFreightRate('999', '2026-07-01', '9999-12-31');

    const orderAfter = await forTenant(seed.tenant.id).order.findUniqueOrThrow(
      { where: { id: order.id } },
    );

    expect(orderAfter.rate.toString()).toBe('100');
  });

  it('impede alterar valor congelado do Order (nenhum UPDATE é liberado)', async () => {
    const freightRate = await createFreightRate('100', '2026-01-01', '9999-12-31');
    const order = await orderService.createFromFreightRate({
      freightRateId: freightRate.id,
      branchId: seed.branch.id,
      senderId: seed.party.id,
      recipientId: seed.party.id,
      tomadorId: seed.party.id,
      total: '500',
    });

    await expect(
      forTenant(seed.tenant.id).order.update({
        where: { id: order.id },
        data: { rate: '999' },
      }),
    ).rejects.toThrow();
  });

  it('impede apagar Order — movimento financeiro nunca se apaga (D-017)', async () => {
    const freightRate = await createFreightRate('100', '2026-01-01', '9999-12-31');
    const order = await orderService.createFromFreightRate({
      freightRateId: freightRate.id,
      branchId: seed.branch.id,
      senderId: seed.party.id,
      recipientId: seed.party.id,
      tomadorId: seed.party.id,
      total: '500',
    });

    await expect(
      forTenant(seed.tenant.id).order.delete({ where: { id: order.id } }),
    ).rejects.toThrow();
  });

  it('impede alterar valor congelado da Quote (só statusId muda)', async () => {
    const freightRate = await createFreightRate('100', '2026-01-01', '9999-12-31');
    const quote = await quoteService.create({
      freightRateId: freightRate.id,
      total: '500',
    });

    await expect(
      forTenant(seed.tenant.id).quote.update({
        where: { id: quote.id },
        data: { rate: '999' },
      }),
    ).rejects.toThrow();

    // status muda sem erro — é a única coluna de valor liberada.
    const closed = await quoteService.close(quote.id);
    expect(closed.statusId).not.toBe(quote.statusId);
  });
});
