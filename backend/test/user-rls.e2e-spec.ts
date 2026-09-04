import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear tenant e usuários — mash_app não
// teria como criar dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('User · Row-Level Security (D-012)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "User", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        email: 'operador@a.com',
        passwordHash: 'hash',
        name: 'Operador A',
        role: 'OPERATOR',
      },
    });
    await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        email: 'operador@b.com',
        passwordHash: 'hash',
        name: 'Operador B',
        role: 'OPERATOR',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "User", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const users = await forTenant(tenantA.id).user.findMany();

    expect(users).toHaveLength(1);
    expect(users[0].tenantId).toBe(tenantA.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const users = await base.user.findMany();

    expect(users).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows = await forTenant(tenantA.id).$queryRaw`SELECT * FROM "User"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).user.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          email: 'forjado@b.com',
          passwordHash: 'hash',
          name: 'Usuário forjado',
          role: 'OPERATOR',
        },
      }),
    ).rejects.toThrow();
  });
});
