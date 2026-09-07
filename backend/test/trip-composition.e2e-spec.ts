import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedOrderScenario } from './helpers/seed-order-scenario.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia provada
// aqui (composição de veículo pertence à viagem, D-018) é imposta por
// CHECK no banco, não por validação da aplicação.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Trip · composição de veículos (D-018)', () => {
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

  it('composição com cavalo mecânico e duas carretas — cada uma um Vehicle próprio', async () => {
    const trip = await forTenant(seed.tenant.id).trip.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        orderId: seed.order.id,
        sequence: 1,
        destinationAddressId: seed.address.id,
        driverId: seed.driver.id,
        vehicleId: seed.tractor.id,
        trailer1Id: seed.trailer1.id,
        trailer2Id: seed.trailer2.id,
        statusId,
      },
    });

    expect(trip.vehicleId).toBe(seed.tractor.id);
    expect(trip.trailer1Id).toBe(seed.trailer1.id);
    expect(trip.trailer2Id).toBe(seed.trailer2.id);
  });

  it('composição com veículo rígido sozinho (truck/toco), sem carreta', async () => {
    const rigidTruck = await admin.vehicle.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        plate: 'RIG1D01',
        renavam: '99999999999',
        type: 'TRUCK',
        capacityKg: '12000',
        tareKg: '5000',
      },
    });

    const trip = await forTenant(seed.tenant.id).trip.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        orderId: seed.order.id,
        sequence: 1,
        destinationAddressId: seed.address.id,
        driverId: seed.driver.id,
        vehicleId: rigidTruck.id,
        statusId,
      },
    });

    expect(trip.vehicleId).toBe(rigidTruck.id);
    expect(trip.trailer1Id).toBeNull();
    expect(trip.trailer2Id).toBeNull();
  });

  it('recusa trailer2 sem trailer1', async () => {
    await expect(
      forTenant(seed.tenant.id).trip.create({
        data: {
          id: uuidv7(),
          tenantId: seed.tenant.id,
          branchId: seed.branch.id,
          orderId: seed.order.id,
          sequence: 1,
          destinationAddressId: seed.address.id,
          driverId: seed.driver.id,
          vehicleId: seed.tractor.id,
          trailer2Id: seed.trailer2.id,
          statusId,
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa o mesmo Vehicle repetido na composição', async () => {
    await expect(
      forTenant(seed.tenant.id).trip.create({
        data: {
          id: uuidv7(),
          tenantId: seed.tenant.id,
          branchId: seed.branch.id,
          orderId: seed.order.id,
          sequence: 1,
          destinationAddressId: seed.address.id,
          driverId: seed.driver.id,
          vehicleId: seed.tractor.id,
          trailer1Id: seed.tractor.id,
          statusId,
        },
      }),
    ).rejects.toThrow();
  });

  it('o mesmo Vehicle (carreta) pode aparecer em Trips diferentes — composição é da viagem, não do cadastro', async () => {
    const otherOrder = await admin.order.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        // seed (seedOrderScenario) já criou o Order número 1 neste
        // tenant+branch — precisa de um número distinto (D-015).
        number: 2,
        freightRateId: seed.freightRate.id,
        senderId: seed.party.id,
        recipientId: seed.party.id,
        tomadorId: seed.party.id,
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
        total: '500',
      },
    });
    const otherTractor = await admin.vehicle.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        plate: 'OUT1R02',
        renavam: '88888888888',
        type: 'CAVALO_MECANICO',
        capacityKg: '25000',
        tareKg: '8000',
      },
    });

    await forTenant(seed.tenant.id).trip.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        orderId: seed.order.id,
        sequence: 1,
        destinationAddressId: seed.address.id,
        driverId: seed.driver.id,
        vehicleId: seed.tractor.id,
        trailer1Id: seed.trailer1.id,
        statusId,
      },
    });
    const secondTrip = await forTenant(seed.tenant.id).trip.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        orderId: otherOrder.id,
        sequence: 1,
        destinationAddressId: seed.address.id,
        driverId: seed.driver.id,
        vehicleId: otherTractor.id,
        trailer1Id: seed.trailer1.id,
        statusId,
      },
    });

    expect(secondTrip.trailer1Id).toBe(seed.trailer1.id);
  });
});
