import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureQuoteCostTypesSeeded } from './helpers/seed-quote-cost-types.js';

// Roda contra o PostgreSQL real do docker-compose — RLS e GRANT de coluna
// são do banco, não dá pra confiar em mock (D-041).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedCostBasedQuote(tenantId: string) {
  const openStatus = await admin.quoteStatus.findFirstOrThrow({
    where: { code: 'OPEN' },
  });
  return admin.quote.create({
    data: {
      id: uuidv7(),
      tenantId,
      statusId: openStatus.id,
      marginPercentage: '18',
      icmsUf: 'SP',
    },
  });
}

describe('QuoteCostLine · RLS e imutabilidade (D-041)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };
  let costTypeId: string;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "QuoteCostLine", "Quote", "QuoteCostType", "QuoteStatus", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    const freightType = await admin.quoteCostType.findFirstOrThrow({
      where: { code: 'FREIGHT' },
    });
    costTypeId = freightType.id;
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "QuoteCostLine", "Quote", "QuoteCostType", "QuoteStatus", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga linha de custo de outro tenant', async () => {
    const quoteA = await seedCostBasedQuote(tenantA.id);
    const quoteB = await seedCostBasedQuote(tenantB.id);
    await admin.quoteCostLine.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        quoteId: quoteA.id,
        costTypeId,
        amount: '500',
      },
    });
    await admin.quoteCostLine.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        quoteId: quoteB.id,
        costTypeId,
        amount: '700',
      },
    });

    const linesForA = await forTenant(tenantA.id).quoteCostLine.findMany();

    expect(linesForA).toHaveLength(1);
    expect(linesForA[0].tenantId).toBe(tenantA.id);
  });

  it('impede gravar no tenant alheio', async () => {
    const quoteB = await seedCostBasedQuote(tenantB.id);

    await expect(
      forTenant(tenantA.id).quoteCostLine.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          quoteId: quoteB.id,
          costTypeId,
          amount: '500',
        },
      }),
    ).rejects.toThrow();
  });

  it('imutável por inteiro desde a criação — UPDATE recusado', async () => {
    const quoteA = await seedCostBasedQuote(tenantA.id);
    const line = await forTenant(tenantA.id).quoteCostLine.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        quoteId: quoteA.id,
        costTypeId,
        description: 'Frete estimado',
        amount: '500',
      },
    });

    await expect(
      forTenant(tenantA.id).quoteCostLine.update({
        where: { id: line.id },
        data: { amount: '999' },
      }),
    ).rejects.toThrow();
  });

  it('imutável por inteiro desde a criação — DELETE recusado', async () => {
    const quoteA = await seedCostBasedQuote(tenantA.id);
    const line = await forTenant(tenantA.id).quoteCostLine.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        quoteId: quoteA.id,
        costTypeId,
        amount: '500',
      },
    });

    await expect(
      forTenant(tenantA.id).quoteCostLine.delete({ where: { id: line.id } }),
    ).rejects.toThrow();
  });
});
