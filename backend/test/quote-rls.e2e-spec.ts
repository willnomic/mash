import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

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
  const customer = await admin.customer.create({
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
      customerId: customer.id,
      laneId: lane.id,
      validFrom: new Date('2026-01-01'),
      validTo: new Date('9999-12-31'),
      rate: '150.5',
      minimumFreight: '500',
      additionalPercentage: '2.5',
    },
  });
  return { tenant, customer, lane, freightRate };
}

describe('Quote · Row-Level Security (D-012)', () => {
  let a: Awaited<ReturnType<typeof seedTenant>>;
  let b: Awaited<ReturnType<typeof seedTenant>>;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "Quote", "FreightRate", "Lane", "Customer", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    a = await seedTenant('A', 'transportadora-a');
    b = await seedTenant('B', 'transportadora-b');
    const openStatus = await admin.quoteStatus.findFirstOrThrow({
      where: { code: 'OPEN' },
    });

    await admin.quote.create({
      data: {
        id: uuidv7(),
        tenantId: a.tenant.id,
        freightRateId: a.freightRate.id,
        statusId: openStatus.id,
        rate: a.freightRate.rate,
        minimumFreight: a.freightRate.minimumFreight,
        additionalPercentage: a.freightRate.additionalPercentage,
        total: '500',
      },
    });
    await admin.quote.create({
      data: {
        id: uuidv7(),
        tenantId: b.tenant.id,
        freightRateId: b.freightRate.id,
        statusId: openStatus.id,
        rate: b.freightRate.rate,
        minimumFreight: b.freightRate.minimumFreight,
        additionalPercentage: b.freightRate.additionalPercentage,
        total: '600',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "Quote", "FreightRate", "Lane", "Customer", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const quotes = await forTenant(a.tenant.id).quote.findMany();

    expect(quotes).toHaveLength(1);
    expect(quotes[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const quotes = await base.quote.findMany();

    expect(quotes).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows = await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "Quote"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    const openStatus = await admin.quoteStatus.findFirstOrThrow({
      where: { code: 'OPEN' },
    });

    await expect(
      forTenant(a.tenant.id).quote.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          freightRateId: b.freightRate.id,
          statusId: openStatus.id,
          rate: '1',
          minimumFreight: '1',
          additionalPercentage: '1',
          total: '1',
        },
      }),
    ).rejects.toThrow();
  });
});
