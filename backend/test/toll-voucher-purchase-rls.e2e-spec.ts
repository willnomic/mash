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

describe('TollVoucherPurchase · Row-Level Security (D-012)', () => {
  let seedA: Awaited<ReturnType<typeof seedCarrierHireScenario>>;
  let seedB: Awaited<ReturnType<typeof seedCarrierHireScenario>>;
  let hireA: { id: string };
  let hireB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "TollVoucherPurchase", "CarrierPayment", "CarrierHire", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    seedA = await seedCarrierHireScenario(admin, 'A', 'transportadora-a');
    seedB = await seedCarrierHireScenario(admin, 'B', 'transportadora-b');

    hireA = await admin.carrierHire.create({
      data: {
        id: uuidv7(),
        tenantId: seedA.tenant.id,
        branchId: seedA.branch.id,
        tripId: seedA.trip.id,
        thirdPartyId: seedA.thirdParty.id,
        agreedFreight: '3000',
      },
    });
    hireB = await admin.carrierHire.create({
      data: {
        id: uuidv7(),
        tenantId: seedB.tenant.id,
        branchId: seedB.branch.id,
        tripId: seedB.trip.id,
        thirdPartyId: seedB.thirdParty.id,
        agreedFreight: '4000',
      },
    });

    await admin.tollVoucherPurchase.create({
      data: {
        id: uuidv7(),
        tenantId: seedA.tenant.id,
        carrierHireId: hireA.id,
        tollVoucherSupplierCnpj: '11444777000161',
        tollVoucherPurchaseNumber: 'VP-001',
        tollVoucherAmount: '450.30',
      },
    });
    await admin.tollVoucherPurchase.create({
      data: {
        id: uuidv7(),
        tenantId: seedB.tenant.id,
        carrierHireId: hireB.id,
        tollVoucherSupplierCnpj: '11444777000161',
        tollVoucherPurchaseNumber: 'VP-002',
        tollVoucherAmount: '120.00',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "TollVoucherPurchase", "CarrierPayment", "CarrierHire", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const purchases = await forTenant(seedA.tenant.id).tollVoucherPurchase.findMany();

    expect(purchases).toHaveLength(1);
    expect(purchases[0].tenantId).toBe(seedA.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const purchases = await base.tollVoucherPurchase.findMany();

    expect(purchases).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows = await forTenant(
      seedA.tenant.id,
    ).$queryRaw`SELECT * FROM "TollVoucherPurchase"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(seedA.tenant.id).tollVoucherPurchase.create({
        data: {
          id: uuidv7(),
          tenantId: seedB.tenant.id,
          carrierHireId: hireB.id,
          tollVoucherSupplierCnpj: '11444777000161',
          tollVoucherPurchaseNumber: 'forjado',
          tollVoucherAmount: '1',
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa CNPJ fora do formato (14 dígitos)', async () => {
    await expect(
      forTenant(seedA.tenant.id).tollVoucherPurchase.create({
        data: {
          id: uuidv7(),
          tenantId: seedA.tenant.id,
          carrierHireId: hireA.id,
          tollVoucherSupplierCnpj: '123',
          tollVoucherPurchaseNumber: 'VP-003',
          tollVoucherAmount: '10',
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa valor não positivo', async () => {
    await expect(
      forTenant(seedA.tenant.id).tollVoucherPurchase.create({
        data: {
          id: uuidv7(),
          tenantId: seedA.tenant.id,
          carrierHireId: hireA.id,
          tollVoucherAmount: '0',
        },
      }),
    ).rejects.toThrow();
  });
});
