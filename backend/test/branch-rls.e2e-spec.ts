import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear tenant e filiais — mash_app não
// teria como criar dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Branch · Row-Level Security (D-012, D-011)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    await admin.branch.create({
      data: { id: uuidv7(), tenantId: tenantA.id, name: 'Matriz' },
    });
    await admin.branch.create({
      data: { id: uuidv7(), tenantId: tenantB.id, name: 'Matriz' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const branches = await forTenant(tenantA.id).branch.findMany();

    expect(branches).toHaveLength(1);
    expect(branches[0].tenantId).toBe(tenantA.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const branches = await base.branch.findMany();

    expect(branches).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(tenantA.id).$queryRaw`SELECT * FROM "Branch"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).branch.create({
        data: { id: uuidv7(), tenantId: tenantB.id, name: 'Filial forjada' },
      }),
    ).rejects.toThrow();
  });
});
