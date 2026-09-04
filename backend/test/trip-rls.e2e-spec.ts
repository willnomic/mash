import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedOrderScenario } from './helpers/seed-order-scenario.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear — mash_app não teria como criar
// dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedTrip(seed: Awaited<ReturnType<typeof seedOrderScenario>>) {
  const status = await admin.tripStatus.findFirstOrThrow({
    where: { code: 'PENDING_RISK_CLEARANCE' },
  });
  return admin.trip.create({
    data: {
      id: uuidv7(),
      tenantId: seed.tenant.id,
      branchId: seed.branch.id,
      orderId: seed.order.id,
      destinationAddressId: seed.address.id,
      driverId: seed.driver.id,
      vehicleId: seed.tractor.id,
      trailer1Id: seed.trailer1.id,
      statusId: status.id,
    },
  });
}

describe('Trip · Row-Level Security (D-012)', () => {
  let a: Awaited<ReturnType<typeof seedOrderScenario>>;
  let b: Awaited<ReturnType<typeof seedOrderScenario>>;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Customer", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
    a = await seedOrderScenario(admin, 'A', 'transportadora-a');
    b = await seedOrderScenario(admin, 'B', 'transportadora-b');
    await seedTrip(a);
    await seedTrip(b);
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Customer", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const trips = await forTenant(a.tenant.id).trip.findMany();

    expect(trips).toHaveLength(1);
    expect(trips[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const trips = await base.trip.findMany();

    expect(trips).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows = await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "Trip"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    const status = await admin.tripStatus.findFirstOrThrow({
      where: { code: 'PENDING_RISK_CLEARANCE' },
    });

    await expect(
      forTenant(a.tenant.id).trip.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          branchId: b.branch.id,
          orderId: b.order.id,
          destinationAddressId: b.address.id,
          driverId: b.driver.id,
          vehicleId: b.tractor.id,
          statusId: status.id,
        },
      }),
    ).rejects.toThrow();
  });
});
