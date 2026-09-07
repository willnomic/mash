import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedOrderScenario } from './helpers/seed-order-scenario.js';

// Roda contra o PostgreSQL real do docker-compose. Não existe portal do
// embarcador ainda (D-010, assento reservado) — este arquivo prova que o
// MODELO sustenta a distinção interno/público que o portal vai precisar,
// simulando a consulta que uma rota pública faria: filtrar por
// status.isPublic.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Trip · status interno não vaza para consulta pública (D-010)', () => {
  let seed: Awaited<ReturnType<typeof seedOrderScenario>>;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    seed = await seedOrderScenario(admin, 'A', 'transportadora-a');
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('consulta filtrada por isPublic esconde a viagem aguardando liberação de risco', async () => {
    const pendingStatus = await admin.tripStatus.findFirstOrThrow({
      where: { code: 'PENDING_RISK_CLEARANCE' },
    });
    const inTransitStatus = await admin.tripStatus.findFirstOrThrow({
      where: { code: 'IN_TRANSIT' },
    });
    expect(pendingStatus.isPublic).toBe(false);
    expect(inTransitStatus.isPublic).toBe(true);

    const pendingTrip = await forTenant(seed.tenant.id).trip.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        orderId: seed.order.id,
        destinationAddressId: seed.address.id,
        driverId: seed.driver.id,
        vehicleId: seed.tractor.id,
        statusId: pendingStatus.id,
      },
    });
    const inTransitTrip = await forTenant(seed.tenant.id).trip.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        orderId: seed.order.id,
        destinationAddressId: seed.address.id,
        driverId: seed.driver.id,
        vehicleId: seed.tractor.id,
        statusId: inTransitStatus.id,
      },
    });

    // Simula exatamente o filtro que uma rota pública (futuro portal do
    // embarcador, D-010) aplicaria — nunca expor status interno.
    const publiclyVisible = await forTenant(seed.tenant.id).trip.findMany({
      where: { status: { isPublic: true } },
    });
    const visibleIds = publiclyVisible.map((t) => t.id);

    expect(visibleIds).toContain(inTransitTrip.id);
    expect(visibleIds).not.toContain(pendingTrip.id);
  });
});
