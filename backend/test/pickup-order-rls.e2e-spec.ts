import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedPickupOrderScenario } from './helpers/seed-pickup-order-scenario.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear — mash_app não teria como criar
// dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "PickupOrderItem", "PickupOrder", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;

describe('PickupOrder · Row-Level Security (D-012)', () => {
  let a: Awaited<ReturnType<typeof seedPickupOrderScenario>>;
  let b: Awaited<ReturnType<typeof seedPickupOrderScenario>>;

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
    a = await seedPickupOrderScenario(admin, 'A', 'transportadora-a');
    b = await seedPickupOrderScenario(admin, 'B', 'transportadora-b');
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const orders = await forTenant(a.tenant.id).pickupOrder.findMany();

    expect(orders).toHaveLength(1);
    expect(orders[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const orders = await base.pickupOrder.findMany();

    expect(orders).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "PickupOrder"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).pickupOrder.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          branchId: b.branch.id,
          tripId: b.trip.id,
          addressId: b.address.id,
          pickupDate: new Date('2026-09-10'),
          totalWeightKg: '1',
          totalVolumeCount: 1,
          totalCubicMeters: '1',
        },
      }),
    ).rejects.toThrow();
  });
});
