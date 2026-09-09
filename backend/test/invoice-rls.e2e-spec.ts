import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedInvoiceScenario } from './helpers/seed-invoice-scenario.js';

// Roda contra o PostgreSQL real do docker-compose — RLS e GRANT são do
// banco, não dá pra confiar em mock (D-042).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Attachment", "ReceivableEvent", "Boleto", "Invoice", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;

describe('Invoice · Row-Level Security e imutabilidade (D-042)', () => {
  let a: Awaited<ReturnType<typeof seedInvoiceScenario>>;
  let b: Awaited<ReturnType<typeof seedInvoiceScenario>>;

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    a = await seedInvoiceScenario(admin, 'A', 'transportadora-a');
    b = await seedInvoiceScenario(admin, 'B', 'transportadora-b');
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga fatura de outro tenant', async () => {
    const invoices = await forTenant(a.tenant.id).invoice.findMany();

    expect(invoices).toHaveLength(1);
    expect(invoices[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const invoices = await base.invoice.findMany();

    expect(invoices).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows = await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "Invoice"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).invoice.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          branchId: b.branch.id,
          partyId: b.party.id,
          number: 2,
        },
      }),
    ).rejects.toThrow();
  });

  it('impede UPDATE — nenhuma coluna é liberada', async () => {
    await expect(
      forTenant(a.tenant.id).invoice.update({
        where: { id: a.invoice.id },
        data: { number: 999 },
      }),
    ).rejects.toThrow();
  });

  it('impede DELETE — histórico financeiro nunca se apaga (D-017)', async () => {
    await expect(
      forTenant(a.tenant.id).invoice.delete({ where: { id: a.invoice.id } }),
    ).rejects.toThrow();
  });

  it('Order.invoiceId aponta pra fatura certa, alcançável a partir de customerReference (D-038, pedido nº 5 da D-042)', async () => {
    const order = await forTenant(a.tenant.id).order.findFirstOrThrow({
      where: { id: a.order.id },
      include: { invoice: true },
    });

    expect(order.invoiceId).toBe(a.invoice.id);
    expect(order.invoice?.id).toBe(a.invoice.id);
  });
});
