import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear — mash_app não teria como criar
// dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Driver · Row-Level Security (D-012)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Driver", "Tenant" CASCADE`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    await admin.driver.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        name: 'Motorista A',
        cpf: '52998224725',
        cnhNumber: '12345678900',
        cnhCategory: 'E',
        cnhValidUntil: new Date('2030-01-01'),
        employmentType: 'EMPLOYEE',
      },
    });
    await admin.driver.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        name: 'Motorista B',
        cpf: '12345678909',
        cnhNumber: '98765432100',
        cnhCategory: 'E',
        cnhValidUntil: new Date('2030-01-01'),
        employmentType: 'SELF_EMPLOYED',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Driver", "Tenant" CASCADE`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const drivers = await forTenant(tenantA.id).driver.findMany();

    expect(drivers).toHaveLength(1);
    expect(drivers[0].tenantId).toBe(tenantA.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const drivers = await base.driver.findMany();

    expect(drivers).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows = await forTenant(tenantA.id).$queryRaw`SELECT * FROM "Driver"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).driver.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          name: 'Motorista forjado',
          cpf: '11111111111',
          cnhNumber: '11111111111',
          cnhCategory: 'E',
          cnhValidUntil: new Date('2030-01-01'),
          employmentType: 'EMPLOYEE',
        },
      }),
    ).rejects.toThrow();
  });
});
