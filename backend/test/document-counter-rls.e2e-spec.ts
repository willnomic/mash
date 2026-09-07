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

async function seedTenantWithBranch(name: string, slug: string) {
  const tenant = await admin.tenant.create({
    data: { id: uuidv7(), name, slug },
  });
  const branch = await admin.branch.create({
    data: { id: uuidv7(), tenantId: tenant.id, name: 'Matriz' },
  });
  return { tenant, branch };
}

describe('DocumentCounter · Row-Level Security (D-012)', () => {
  let a: Awaited<ReturnType<typeof seedTenantWithBranch>>;
  let b: Awaited<ReturnType<typeof seedTenantWithBranch>>;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "DocumentCounter", "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    a = await seedTenantWithBranch('A', 'transportadora-a');
    b = await seedTenantWithBranch('B', 'transportadora-b');
    await admin.documentCounter.create({
      data: {
        id: uuidv7(),
        tenantId: a.tenant.id,
        branchId: a.branch.id,
        documentType: 'ORDER',
      },
    });
    await admin.documentCounter.create({
      data: {
        id: uuidv7(),
        tenantId: b.tenant.id,
        branchId: b.branch.id,
        documentType: 'ORDER',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "DocumentCounter", "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const counters = await forTenant(a.tenant.id).documentCounter.findMany();

    expect(counters).toHaveLength(1);
    expect(counters[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const counters = await base.documentCounter.findMany();

    expect(counters).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "DocumentCounter"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).documentCounter.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          branchId: b.branch.id,
          documentType: 'ORDER',
          series: '2',
        },
      }),
    ).rejects.toThrow();
  });
});
