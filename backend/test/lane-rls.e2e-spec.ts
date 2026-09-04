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

describe('Lane · Row-Level Security (D-012)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "FreightRate", "Lane", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    await admin.lane.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        originCity: 'São Paulo',
        originState: 'SP',
        destinationCity: 'Curitiba',
        destinationState: 'PR',
      },
    });
    await admin.lane.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        originCity: 'Rio de Janeiro',
        originState: 'RJ',
        destinationCity: 'Belo Horizonte',
        destinationState: 'MG',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "FreightRate", "Lane", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const lanes = await forTenant(tenantA.id).lane.findMany();

    expect(lanes).toHaveLength(1);
    expect(lanes[0].tenantId).toBe(tenantA.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const lanes = await base.lane.findMany();

    expect(lanes).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows = await forTenant(tenantA.id).$queryRaw`SELECT * FROM "Lane"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).lane.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          originCity: 'Forjado',
          originState: 'SP',
          destinationCity: 'Forjado',
          destinationState: 'SP',
        },
      }),
    ).rejects.toThrow();
  });
});
