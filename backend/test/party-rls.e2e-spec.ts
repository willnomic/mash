import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear — mash_app não teria como criar
// dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Party · Row-Level Security (D-012)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        personType: 'INDIVIDUAL',
        name: 'Cliente A',
        cpf: '52998224725',
      },
    });
    await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        personType: 'COMPANY',
        name: 'Cliente B',
        cnpj: '11444777000161',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const parties = await forTenant(tenantA.id).party.findMany();

    expect(parties).toHaveLength(1);
    expect(parties[0].tenantId).toBe(tenantA.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const parties = await base.party.findMany();

    expect(parties).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(tenantA.id).$queryRaw`SELECT * FROM "Party"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).party.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          personType: 'INDIVIDUAL',
          name: 'Cliente forjado',
          cpf: '12345678909',
        },
      }),
    ).rejects.toThrow();
  });
});
