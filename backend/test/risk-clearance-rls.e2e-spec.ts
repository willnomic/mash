import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { seedOrderScenario } from './helpers/seed-order-scenario.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Conecta como dono só para semear — mash_app não teria como criar
// dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedClearance(seed: Awaited<ReturnType<typeof seedOrderScenario>>) {
  return admin.riskClearance.create({
    data: {
      id: uuidv7(),
      tenantId: seed.tenant.id,
      number: '2026-000123',
      driverId: seed.driver.id,
      vehicleId: seed.tractor.id,
      ownerName: 'Transportadora Própria Ltda',
      checkDate: new Date('2026-01-01'),
      validUntil: new Date('2027-01-01'),
      result: 'RECOMENDADO',
    },
  });
}

describe('RiskClearance · Row-Level Security (D-012)', () => {
  let a: Awaited<ReturnType<typeof seedOrderScenario>>;
  let b: Awaited<ReturnType<typeof seedOrderScenario>>;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    a = await seedOrderScenario(admin, 'A', 'transportadora-a');
    b = await seedOrderScenario(admin, 'B', 'transportadora-b');
    await seedClearance(a);
    await seedClearance(b);
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const clearances = await forTenant(a.tenant.id).riskClearance.findMany();

    expect(clearances).toHaveLength(1);
    expect(clearances[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const clearances = await base.riskClearance.findMany();

    expect(clearances).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "RiskClearance"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).riskClearance.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          number: 'forjado',
          driverId: b.driver.id,
          vehicleId: b.tractor.id,
          ownerName: 'Forjado',
          checkDate: new Date('2026-01-01'),
          validUntil: new Date('2027-01-01'),
          result: 'RECOMENDADO',
        },
      }),
    ).rejects.toThrow();
  });

  it('impede apagar — é evidência de conformidade (D-023, D-017)', async () => {
    const clearance = await forTenant(a.tenant.id).riskClearance.findFirstOrThrow();

    await expect(
      forTenant(a.tenant.id).riskClearance.delete({
        where: { id: clearance.id },
      }),
    ).rejects.toThrow();
  });

  it('impede alterar result depois de criada — uma ficha não pode mudar de resultado em silêncio (D-023, D-017)', async () => {
    const clearance = await forTenant(a.tenant.id).riskClearance.findFirstOrThrow();
    expect(clearance.result).toBe('RECOMENDADO');

    await expect(
      forTenant(a.tenant.id).riskClearance.update({
        where: { id: clearance.id },
        data: { result: 'NAO_RECOMENDADO' },
      }),
    ).rejects.toThrow();
  });

  it('impede alterar checkDate e validUntil depois de criada', async () => {
    const clearance = await forTenant(a.tenant.id).riskClearance.findFirstOrThrow();

    await expect(
      forTenant(a.tenant.id).riskClearance.update({
        where: { id: clearance.id },
        data: { checkDate: new Date('2026-06-01'), validUntil: new Date('2028-01-01') },
      }),
    ).rejects.toThrow();
  });
});
