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
  return { tenant, party, lane };
}

describe('FreightRate · Row-Level Security (D-012)', () => {
  let a: Awaited<ReturnType<typeof seedTenant>>;
  let b: Awaited<ReturnType<typeof seedTenant>>;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "FreightRate", "Lane", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    a = await seedTenant('A', 'transportadora-a');
    b = await seedTenant('B', 'transportadora-b');
    await admin.freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: a.tenant.id,
        partyId: a.party.id,
        laneId: a.lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-12-31'),
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });
    await admin.freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: b.tenant.id,
        partyId: b.party.id,
        laneId: b.lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-12-31'),
        rate: '200',
        minimumFreight: '600',
        additionalPercentage: '3',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "FreightRate", "Lane", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const rates = await forTenant(a.tenant.id).freightRate.findMany();

    expect(rates).toHaveLength(1);
    expect(rates[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const rates = await base.freightRate.findMany();

    expect(rates).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "FreightRate"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).freightRate.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          partyId: b.party.id,
          laneId: b.lane.id,
          validFrom: new Date('2027-01-01'),
          validTo: new Date('2027-12-31'),
          rate: '999',
          minimumFreight: '999',
          additionalPercentage: '9',
        },
      }),
    ).rejects.toThrow();
  });
});
