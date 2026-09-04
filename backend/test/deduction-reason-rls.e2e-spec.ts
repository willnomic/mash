import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureDeductionReasonsSeeded } from './helpers/seed-deduction-reasons.js';

// DeductionReason tem RLS diferente das demais tabelas (D-020): tenantId
// nulo = padrão do sistema, visível a qualquer tenant. Mesmo mecanismo do
// QuoteStatus (test/quote-status-rls.e2e-spec.ts) — este arquivo prova a
// instância nova, não o mecanismo em si.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('DeductionReason · RLS com padrão do sistema (D-020)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "CarrierPayment", "DeductionReason", "Tenant" CASCADE`;
    await ensureDeductionReasonsSeeded(admin);
    await admin.$executeRaw`DELETE FROM "DeductionReason" WHERE "tenantId" IS NOT NULL`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "CarrierPayment", "DeductionReason", "Tenant" CASCADE`;
    await ensureDeductionReasonsSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('qualquer tenant enxerga os quatro motivos padrão semeados na migração', async () => {
    const reasons = await forTenant(tenantA.id).deductionReason.findMany({
      where: { tenantId: null },
    });

    expect(reasons.map((r) => r.code).sort()).toEqual([
      'DAMAGE',
      'DETENTION',
      'FINE',
      'FUEL',
    ]);
  });

  it('não enxerga motivo próprio de outro tenant', async () => {
    await admin.deductionReason.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        code: 'CUSTOM_B',
        name: 'Motivo só do B',
      },
    });

    const visibleToA = await forTenant(tenantA.id).deductionReason.findMany({
      where: { code: 'CUSTOM_B' },
    });

    expect(visibleToA).toHaveLength(0);
  });
});
