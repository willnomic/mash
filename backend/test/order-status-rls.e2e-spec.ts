import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureOrderStatusesSeeded } from './helpers/seed-order-statuses.js';

// OrderStatus tem RLS diferente das demais tabelas (D-020, mesmo padrão
// do QuoteStatus): tenantId nulo = padrão do sistema, visível a qualquer
// tenant. Este arquivo prova o mecanismo, não o padrão já coberto em
// outros *-rls.e2e-spec.ts.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('OrderStatus · RLS com padrão do sistema (D-020, D-038)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "Tenant" CASCADE`;
    await ensureOrderStatusesSeeded(admin);
    await admin.$executeRaw`DELETE FROM "OrderStatus" WHERE "tenantId" IS NOT NULL`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "Tenant" CASCADE`;
    await ensureOrderStatusesSeeded(admin);
    await admin.$executeRaw`DELETE FROM "OrderStatus" WHERE "tenantId" IS NOT NULL`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('qualquer tenant enxerga os três status padrão semeados na migração', async () => {
    const statuses = await forTenant(tenantA.id).orderStatus.findMany({
      where: { tenantId: null },
    });

    expect(statuses.map((s) => s.code).sort()).toEqual([
      'CANCELLED',
      'COMPLETED',
      'IN_PROGRESS',
    ]);
  });

  it('não enxerga status próprio de outro tenant', async () => {
    await admin.orderStatus.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        code: 'CUSTOM_B',
        name: 'Status só do B',
      },
    });

    const visibleToA = await forTenant(tenantA.id).orderStatus.findMany({
      where: { code: 'CUSTOM_B' },
    });

    expect(visibleToA).toHaveLength(0);
  });
});
