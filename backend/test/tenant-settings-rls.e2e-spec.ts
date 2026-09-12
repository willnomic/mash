import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Unidade "configuração do tenant": TenantSettings segue o
// mesmo isolamento padrão por tenant (D-012) de toda tabela com
// tenantId — mesmo padrão de teste de group-permission-rls.e2e-spec.ts
// (D-055).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('TenantSettings · Row-Level Security (D-012)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };
  let settingsA: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "TenantSettings", "Tenant" CASCADE`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    settingsA = await admin.tenantSettings.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        defaultQuoteValidityUnit: 'DAYS',
        defaultQuoteValidityAmount: 30,
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "TenantSettings", "Tenant" CASCADE`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga configuração de outro tenant', async () => {
    const settings = await forTenant(tenantA.id).tenantSettings.findMany();

    expect(settings).toHaveLength(1);
    expect(settings[0].id).toBe(settingsA.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const settings = await base.tenantSettings.findMany();

    expect(settings).toHaveLength(0);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).tenantSettings.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          defaultQuoteValidityUnit: 'NEVER',
          defaultQuoteValidityAmount: null,
        },
      }),
    ).rejects.toThrow();
  });

  it('editar a configuração de um tenant não afeta o outro', async () => {
    const settingsB = await admin.tenantSettings.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        defaultQuoteValidityUnit: 'NEVER',
        defaultQuoteValidityAmount: null,
      },
    });

    await forTenant(tenantA.id).tenantSettings.update({
      where: { id: settingsA.id },
      data: { defaultQuoteValidityAmount: 60 },
    });

    const stillB = await forTenant(tenantB.id).tenantSettings.findUniqueOrThrow({
      where: { id: settingsB.id },
    });
    expect(stillB.defaultQuoteValidityUnit).toBe('NEVER');
    expect(stillB.defaultQuoteValidityAmount).toBeNull();
  });
});
