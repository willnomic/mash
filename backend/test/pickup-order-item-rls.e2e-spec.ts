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

describe('PickupOrderItem · Row-Level Security (D-012)', () => {
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
    const items = await forTenant(a.tenant.id).pickupOrderItem.findMany();

    expect(items).toHaveLength(1);
    expect(items[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const items = await base.pickupOrderItem.findMany();

    expect(items).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "PickupOrderItem"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).pickupOrderItem.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          pickupOrderId: b.pickupOrder.id,
          description: 'Item forjado',
          quantity: 1,
        },
      }),
    ).rejects.toThrow();
  });
});
