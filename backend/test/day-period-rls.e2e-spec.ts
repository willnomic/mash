import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureDayPeriodsSeeded } from './helpers/seed-day-periods.js';

// DayPeriod tem RLS diferente das demais tabelas (D-020, mesmo padrão do
// OrderStatus/QuoteCostType): tenantId nulo = padrão do sistema, visível
// a qualquer tenant. Este arquivo prova o mecanismo, não o padrão já
// coberto em outros *-rls.e2e-spec.ts.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('DayPeriod · RLS com padrão do sistema (D-020)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "PickupOrder", "Tenant" CASCADE`;
    await ensureDayPeriodsSeeded(admin);
    await admin.$executeRaw`DELETE FROM "DayPeriod" WHERE "tenantId" IS NOT NULL`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "PickupOrder", "Tenant" CASCADE`;
    await ensureDayPeriodsSeeded(admin);
    await admin.$executeRaw`DELETE FROM "DayPeriod" WHERE "tenantId" IS NOT NULL`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('qualquer tenant enxerga os nove períodos padrão semeados na migração', async () => {
    const periods = await forTenant(tenantA.id).dayPeriod.findMany({
      where: { tenantId: null },
    });

    expect(periods.map((p) => p.code).sort()).toEqual([
      'ALL_DAY',
      'AFTERNOON',
      'EARLY_AFTERNOON',
      'END_OF_DAY',
      'EVENING',
      'FIRST_HOUR',
      'LATE_MORNING',
      'MIDDAY',
      'MORNING',
    ].sort());
  });

  it('não enxerga período próprio de outro tenant', async () => {
    await admin.dayPeriod.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        code: 'CUSTOM_B',
        name: 'Período só do B',
      },
    });

    const visibleToA = await forTenant(tenantA.id).dayPeriod.findMany({
      where: { code: 'CUSTOM_B' },
    });

    expect(visibleToA).toHaveLength(0);
  });
});
