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

describe('Vehicle · Row-Level Security (D-012)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Vehicle", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    await admin.vehicle.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        plate: 'ABC1D23',
        renavam: '12345678900',
        type: 'CAVALO_MECANICO',
        capacityKg: '25000',
        tareKg: '8000',
      },
    });
    await admin.vehicle.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        plate: 'XYZ9E87',
        renavam: '98765432100',
        type: 'CARRETA',
        capacityKg: '30000',
        tareKg: '7000',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Vehicle", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const vehicles = await forTenant(tenantA.id).vehicle.findMany();

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].tenantId).toBe(tenantA.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const vehicles = await base.vehicle.findMany();

    expect(vehicles).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(tenantA.id).$queryRaw`SELECT * FROM "Vehicle"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).vehicle.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          plate: 'FOR1J01',
          renavam: '11111111111',
          type: 'TRUCK',
          capacityKg: '10000',
          tareKg: '4000',
        },
      }),
    ).rejects.toThrow();
  });
});
