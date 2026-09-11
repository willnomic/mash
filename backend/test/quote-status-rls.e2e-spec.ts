import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

// QuoteStatus tem RLS diferente das demais tabelas (D-020): tenantId nulo
// = padrão do sistema, visível a qualquer tenant. Este arquivo prova o
// mecanismo novo, não o padrão já coberto em outros *-rls.e2e-spec.ts.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('QuoteStatus · RLS com padrão do sistema (D-020)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Quote", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$executeRaw`DELETE FROM "QuoteStatus" WHERE "tenantId" IS NOT NULL`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Quote", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$executeRaw`DELETE FROM "QuoteStatus" WHERE "tenantId" IS NOT NULL`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('qualquer tenant enxerga os quatro status padrão semeados na migração', async () => {
    const statuses = await forTenant(tenantA.id).quoteStatus.findMany({
      where: { tenantId: null },
    });

    expect(statuses.map((s) => s.code).sort()).toEqual([
      'ACCEPTED',
      'CLOSED',
      'OPEN',
      'REJECTED',
    ]);
  });

  it('não enxerga status próprio de outro tenant', async () => {
    await admin.quoteStatus.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        code: 'CUSTOM_B',
        name: 'Status só do B',
      },
    });

    const visibleToA = await forTenant(tenantA.id).quoteStatus.findMany({
      where: { code: 'CUSTOM_B' },
    });

    expect(visibleToA).toHaveLength(0);
  });
});
