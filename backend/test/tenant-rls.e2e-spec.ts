import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear os dois tenants do teste —
// mash_app não teria como criar dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Tenant · Row-Level Security (D-012)', () => {
  let tenantA: { id: string; name: string };
  let tenantB: { id: string; name: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Tenant"`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Tenant"`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const tenants = await forTenant(tenantA.id).tenant.findMany();

    expect(tenants).toHaveLength(1);
    expect(tenants.map((t) => t.id)).toEqual([tenantA.id]);
    expect(tenants.some((t) => t.id === tenantB.id)).toBe(false);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const tenants = await base.tenant.findMany();

    expect(tenants).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(tenantA.id).$queryRaw`SELECT * FROM "Tenant"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).tenant.create({
        data: { id: uuidv7(), name: 'Tenant forjado' },
      }),
    ).rejects.toThrow();
  });

  it('toda tabela com tenantId (ou id como fronteira) tem RLS forçado', async () => {
    const unprotected = await admin.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN ('Tenant')
        AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
    `;

    expect(unprotected).toEqual([]);
  });
});
