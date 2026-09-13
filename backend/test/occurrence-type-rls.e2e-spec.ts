import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureOccurrenceTypesSeeded } from './helpers/seed-occurrence-types.js';

// OccurrenceType tem RLS diferente das demais tabelas (D-020): tenantId
// nulo = padrão do sistema, visível a qualquer tenant. Mesmo mecanismo do
// QuoteStatus/DeductionReason (test/deduction-reason-rls.e2e-spec.ts) —
// este arquivo prova a instância nova, não o mecanismo em si.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('OccurrenceType · RLS com padrão do sistema (D-020)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Occurrence", "OccurrenceType", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureOccurrenceTypesSeeded(admin);
    await admin.$executeRaw`DELETE FROM "OccurrenceType" WHERE "tenantId" IS NOT NULL`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Occurrence", "OccurrenceType", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureOccurrenceTypesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('qualquer tenant enxerga os três tipos padrão semeados nas migrações', async () => {
    const types = await forTenant(tenantA.id).occurrenceType.findMany({
      where: { tenantId: null },
    });

    expect(types.map((t) => t.code).sort()).toEqual([
      'COMMERCIAL_HOLD',
      'DELAY',
      'EMPTY_RETURN',
    ]);
  });

  it('não enxerga tipo próprio de outro tenant', async () => {
    await admin.occurrenceType.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        code: 'CUSTOM_B',
        name: 'Tipo só do B',
      },
    });

    const visibleToA = await forTenant(tenantA.id).occurrenceType.findMany({
      where: { code: 'CUSTOM_B' },
    });

    expect(visibleToA).toHaveLength(0);
  });
});
