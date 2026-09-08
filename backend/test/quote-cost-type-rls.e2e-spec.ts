import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteCostTypesSeeded } from './helpers/seed-quote-cost-types.js';

// QuoteCostType tem RLS diferente das demais tabelas (D-020): tenantId
// nulo = padrão do sistema, visível a qualquer tenant. Mesmo mecanismo do
// QuoteStatus/DeductionReason — este arquivo prova a instância nova, não
// o mecanismo em si.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('QuoteCostType · RLS com padrão do sistema (D-020/D-041)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "QuoteCostLine", "QuoteCostType", "Tenant" CASCADE`;
    await ensureQuoteCostTypesSeeded(admin);
    await admin.$executeRaw`DELETE FROM "QuoteCostType" WHERE "tenantId" IS NOT NULL`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "QuoteCostLine", "QuoteCostType", "Tenant" CASCADE`;
    await ensureQuoteCostTypesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('qualquer tenant enxerga os cinco tipos padrão semeados na migração', async () => {
    const types = await forTenant(tenantA.id).quoteCostType.findMany({
      where: { tenantId: null },
    });

    expect(types.map((t) => t.code).sort()).toEqual([
      'FEES',
      'FREIGHT',
      'FUEL',
      'INSURANCE',
      'TOLL',
    ]);
  });

  it('não enxerga tipo próprio de outro tenant', async () => {
    await admin.quoteCostType.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        code: 'CUSTOM_B',
        name: 'Tipo só do B',
      },
    });

    const visibleToA = await forTenant(tenantA.id).quoteCostType.findMany({
      where: { code: 'CUSTOM_B' },
    });

    expect(visibleToA).toHaveLength(0);
  });

  it('custo novo é INSERT nesta tabela, não migração — tenant pode criar seu próprio tipo', async () => {
    const created = await forTenant(tenantA.id).quoteCostType.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        code: 'UNLOADING',
        name: 'Descarga',
      },
    });

    expect(created.code).toBe('UNLOADING');
  });
});
