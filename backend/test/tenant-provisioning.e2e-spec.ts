import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { TenantsService } from '../src/tenant/tenants.service.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: a garantia
// que este arquivo prova é a transação Tenant+Branch, e isso é do banco).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('TenantsService · filial padrão nasce junto com o tenant (D-011)', () => {
  const tenantsService = new TenantsService();

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Branch", "Tenant" CASCADE`;
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Branch", "Tenant" CASCADE`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('criar um tenant cria a filial padrão automaticamente', async () => {
    const tenant = await tenantsService.create({
      name: 'Transportadora Nova',
      slug: 'transportadora-nova',
    });

    const branches = await forTenant(tenant.id).branch.findMany();

    expect(branches).toHaveLength(1);
    expect(branches[0].tenantId).toBe(tenant.id);
    expect(branches[0].name).toBe('Matriz');
  });

  it('a filial padrão pertence só ao tenant que a gerou', async () => {
    const tenantA = await tenantsService.create({
      name: 'Transportadora A',
      slug: 'transportadora-a',
    });
    const tenantB = await tenantsService.create({
      name: 'Transportadora B',
      slug: 'transportadora-b',
    });

    const branchesA = await forTenant(tenantA.id).branch.findMany();
    const branchesB = await forTenant(tenantB.id).branch.findMany();

    expect(branchesA).toHaveLength(1);
    expect(branchesB).toHaveLength(1);
    expect(branchesA[0].id).not.toBe(branchesB[0].id);
  });
});
