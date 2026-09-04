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

describe('Tenant · Row-Level Security (D-012, exceção de leitura em D-029)', () => {
  let tenantA: { id: string; name: string; slug: string };
  let tenantB: { id: string; name: string; slug: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Tenant" CASCADE`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Tenant" CASCADE`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('leitura é pública, mesmo sem tenant definido na sessão (D-029)', async () => {
    const tenants = await base.tenant.findMany();

    expect(tenants).toHaveLength(2);
    expect(tenants.map((t) => t.id).sort()).toEqual(
      [tenantA.id, tenantB.id].sort(),
    );
  });

  it('leitura pública também vale para consulta crua', async () => {
    const rows = await base.$queryRaw`SELECT * FROM "Tenant"`;

    expect(rows).toHaveLength(2);
  });

  it('resolve slug -> tenant sem nenhum tenant definido na sessão', async () => {
    const found = await base.tenant.findUnique({
      where: { slug: tenantA.slug },
    });

    expect(found?.id).toBe(tenantA.id);
  });

  it('impede criar tenant com id diferente do tenant da sessão', async () => {
    await expect(
      forTenant(tenantA.id).tenant.create({
        data: { id: uuidv7(), name: 'Tenant forjado', slug: 'forjado' },
      }),
    ).rejects.toThrow();
  });

  it('impede atualizar tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).tenant.update({
        where: { id: tenantB.id },
        data: { name: 'Nome adulterado' },
      }),
    ).rejects.toThrow();
  });

  it('impede apagar tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).tenant.delete({
        where: { id: tenantB.id },
      }),
    ).rejects.toThrow();
  });
});
