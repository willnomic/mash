import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedCarrierHireScenario } from './helpers/seed-carrier-hire-scenario.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear — mash_app não teria como criar
// dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('CarrierHire · Row-Level Security (D-012)', () => {
  let seedA: Awaited<ReturnType<typeof seedCarrierHireScenario>>;
  let seedB: Awaited<ReturnType<typeof seedCarrierHireScenario>>;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "CarrierPayment", "CarrierHire", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Customer", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    seedA = await seedCarrierHireScenario(admin, 'A', 'transportadora-a');
    seedB = await seedCarrierHireScenario(admin, 'B', 'transportadora-b');

    await admin.carrierHire.create({
      data: {
        id: uuidv7(),
        tenantId: seedA.tenant.id,
        branchId: seedA.branch.id,
        tripId: seedA.trip.id,
        thirdPartyId: seedA.thirdParty.id,
        agreedFreight: '3000',
      },
    });
    await admin.carrierHire.create({
      data: {
        id: uuidv7(),
        tenantId: seedB.tenant.id,
        branchId: seedB.branch.id,
        tripId: seedB.trip.id,
        thirdPartyId: seedB.thirdParty.id,
        agreedFreight: '4000',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "CarrierPayment", "CarrierHire", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Customer", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const hires = await forTenant(seedA.tenant.id).carrierHire.findMany();

    expect(hires).toHaveLength(1);
    expect(hires[0].tenantId).toBe(seedA.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const hires = await base.carrierHire.findMany();

    expect(hires).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows = await forTenant(
      seedA.tenant.id,
    ).$queryRaw`SELECT * FROM "CarrierHire"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(seedA.tenant.id).carrierHire.create({
        data: {
          id: uuidv7(),
          tenantId: seedB.tenant.id,
          branchId: seedB.branch.id,
          tripId: seedB.trip.id,
          thirdPartyId: seedB.thirdParty.id,
          agreedFreight: '1',
        },
      }),
    ).rejects.toThrow();
  });
});
