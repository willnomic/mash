import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureIbsCbsTaxSituationsSeeded } from './helpers/seed-ibs-cbs-tax-situations.js';

// IbsCbsTaxSituation tem RLS diferente das demais tabelas (D-020): tenantId
// nulo = padrão do sistema, visível a qualquer tenant. Mesmo mecanismo do
// QuoteCostType/QuoteStatus/DeductionReason — este arquivo prova a
// instância nova (D-043), não o mecanismo em si.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('IbsCbsTaxSituation · RLS com padrão do sistema (D-020/D-043)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "IbsCbsTaxSituation", "Tenant" CASCADE`;
    await ensureIbsCbsTaxSituationsSeeded(admin);
    await admin.$executeRaw`DELETE FROM "IbsCbsTaxSituation" WHERE "tenantId" IS NOT NULL`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "IbsCbsTaxSituation", "Tenant" CASCADE`;
    await ensureIbsCbsTaxSituationsSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('qualquer tenant enxerga o caso padrão semeado na migração', async () => {
    const situations = await forTenant(tenantA.id).ibsCbsTaxSituation.findMany({
      where: { tenantId: null },
    });

    expect(situations).toHaveLength(1);
    expect(situations[0].cst).toBe('000');
    expect(situations[0].cClassTrib).toBe('000001');
  });

  it('não enxerga situação tributária própria de outro tenant', async () => {
    await admin.ibsCbsTaxSituation.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        cst: '200',
        cClassTrib: '200001',
        name: 'Caso só do B',
      },
    });

    const visibleToA = await forTenant(tenantA.id).ibsCbsTaxSituation.findMany({
      where: { cst: '200' },
    });

    expect(visibleToA).toHaveLength(0);
  });

  it('tenant pode registrar sua própria combinação — não é enum, é INSERT (D-043)', async () => {
    const created = await forTenant(tenantA.id).ibsCbsTaxSituation.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        cst: '410',
        cClassTrib: '410001',
        name: 'Isenta — caso adicionado pelo tenant A',
      },
    });

    expect(created.cst).toBe('410');
  });
});
