import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedOrderScenario } from './helpers/seed-order-scenario.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia provada
// aqui (transbordo: um Order pode ter mais de uma Trip em sequência,
// D-018/estado.md, pendência resolvida pelo sócio) é imposta por
// constraint única no banco, não por validação da aplicação.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Trip · sequência dentro do pedido (transbordo)', () => {
  let seed: Awaited<ReturnType<typeof seedOrderScenario>>;
  let statusId: string;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    seed = await seedOrderScenario(admin, 'A', 'transportadora-a');
    const status = await admin.tripStatus.findFirstOrThrow({
      where: { code: 'PENDING_RISK_CLEARANCE' },
    });
    statusId = status.id;
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  function tripData(sequence: number) {
    return {
      id: uuidv7(),
      tenantId: seed.tenant.id,
      branchId: seed.branch.id,
      orderId: seed.order.id,
      sequence,
      destinationAddressId: seed.address.id,
      driverId: seed.driver.id,
      vehicleId: seed.tractor.id,
      statusId,
    };
  }

  it('pedido com três pernas em sequência (transbordo)', async () => {
    const trips = await Promise.all(
      [1, 2, 3].map((sequence) =>
        forTenant(seed.tenant.id).trip.create({ data: tripData(sequence) }),
      ),
    );

    expect(trips.map((t) => t.sequence).sort()).toEqual([1, 2, 3]);
  });

  it('recusa sequence duplicada dentro do mesmo pedido', async () => {
    await forTenant(seed.tenant.id).trip.create({ data: tripData(1) });

    await expect(
      forTenant(seed.tenant.id).trip.create({ data: tripData(1) }),
    ).rejects.toThrow();
  });

  it('aceita buraco na sequência — perna cancelada não tem consequência legal como o CT-e', async () => {
    await forTenant(seed.tenant.id).trip.create({ data: tripData(1) });
    const third = await forTenant(seed.tenant.id).trip.create({
      data: tripData(3),
    });

    expect(third.sequence).toBe(3);
  });
});
