import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureOrderStatusesSeeded } from './helpers/seed-order-statuses.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear — mash_app não teria como criar
// dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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
  return { tenant, branch, party, lane, freightRate };
}

async function seedOrder(seed: Awaited<ReturnType<typeof seedTenant>>) {
  const status = await admin.orderStatus.findFirstOrThrow({
    where: { code: 'IN_PROGRESS' },
  });
  return admin.order.create({
    data: {
      id: uuidv7(),
      tenantId: seed.tenant.id,
      branchId: seed.branch.id,
      number: 1,
      statusId: status.id,
      freightRateId: seed.freightRate.id,
      senderId: seed.party.id,
      recipientId: seed.party.id,
      tomadorId: seed.party.id,
      rate: seed.freightRate.rate,
      minimumFreight: seed.freightRate.minimumFreight,
      additionalPercentage: seed.freightRate.additionalPercentage,
      total: '500',
    },
  });
}

describe('Order · Row-Level Security (D-012)', () => {
  let a: Awaited<ReturnType<typeof seedTenant>>;
  let b: Awaited<ReturnType<typeof seedTenant>>;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "Quote", "FreightRate", "Lane", "Party", "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await ensureOrderStatusesSeeded(admin);
    a = await seedTenant('A', 'transportadora-a');
    b = await seedTenant('B', 'transportadora-b');
    await seedOrder(a);
    await seedOrder(b);
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "Quote", "FreightRate", "Lane", "Party", "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await ensureOrderStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const orders = await forTenant(a.tenant.id).order.findMany();

    expect(orders).toHaveLength(1);
    expect(orders[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const orders = await base.order.findMany();

    expect(orders).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows = await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "Order"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    const status = await admin.orderStatus.findFirstOrThrow({
      where: { code: 'IN_PROGRESS' },
    });

    await expect(
      forTenant(a.tenant.id).order.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          branchId: b.branch.id,
          number: 2,
          statusId: status.id,
          freightRateId: b.freightRate.id,
          senderId: b.party.id,
          recipientId: b.party.id,
          tomadorId: b.party.id,
          rate: '1',
          minimumFreight: '1',
          additionalPercentage: '1',
          total: '1',
        },
      }),
    ).rejects.toThrow();
  });
});
