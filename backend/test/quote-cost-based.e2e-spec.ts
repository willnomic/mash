import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureQuoteCostTypesSeeded } from './helpers/seed-quote-cost-types.js';
import { QuoteService } from '../src/quote/quote.service.js';
import { TaxRateService } from '../src/tax-rate/tax-rate.service.js';
import { TenantPrisma } from '../src/tenant/tenant-prisma.service.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia provada
// aqui (D-041: caminho de custo ponta a ponta, com as alíquotas REAIS
// semeadas na migração, não valores forjados no teste) é do serviço e do
// banco juntos.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function tenantPrismaFor(tenantId: string): TenantPrisma {
  const fakeCls = { get: () => tenantId } as unknown as ClsService;
  return new TenantPrisma(fakeCls);
}

const TRUNCATE = `TRUNCATE TABLE "QuoteCostLine", "Quote", "QuoteCostType", "QuoteStatus", "Tenant" CASCADE`;

describe('Quote · caminho de custo, ponta a ponta (D-041)', () => {
  let tenant: { id: string };
  let quoteService: QuoteService;
  let freightTypeId: string;
  let tollTypeId: string;
  let fuelTypeId: string;

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);

    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    freightTypeId = (
      await admin.quoteCostType.findFirstOrThrow({ where: { code: 'FREIGHT' } })
    ).id;
    tollTypeId = (
      await admin.quoteCostType.findFirstOrThrow({ where: { code: 'TOLL' } })
    ).id;
    fuelTypeId = (
      await admin.quoteCostType.findFirstOrThrow({ where: { code: 'FUEL' } })
    ).id;

    quoteService = new QuoteService(
      tenantPrismaFor(tenant.id),
      new TaxRateService(),
    );
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('cria com linhas de custo, fecha, e o preço final bate com as alíquotas REAIS semeadas na migração', async () => {
    // Custo total 820 — mesmo caso conferido à mão do
    // quote-pricing-calculator.spec.ts (fecha sem dízima em toda etapa):
    // etapa 1, ICMS 18% por dentro (São Paulo, semente da migração):
    // 820 / 0.82 = 1000. etapa 2, IBS 0,1% + CBS 0,9% por fora (soma
    // simples sobre 1000, NÃO gross-up): 1000 + 1 + 9 = 1010. etapa 3,
    // margem 20% por dentro: 1010 / 0.80 = 1262.5.
    const quote = await quoteService.createCostBased({
      icmsUf: 'SP',
      marginPercentage: '20',
      costLines: [
        { costTypeId: freightTypeId, amount: '400', description: 'Frete do terceiro' },
        { costTypeId: tollTypeId, amount: '300' },
        { costTypeId: fuelTypeId, amount: '120' },
      ],
    });

    expect(quote.freightRateId).toBeNull();
    expect(quote.total).toBeNull();

    const closed = await quoteService.close(quote.id);

    expect(closed.icmsRateApplied?.toString()).toBe('18');
    expect(closed.ibsRateApplied?.toString()).toBe('0.1');
    expect(closed.cbsRateApplied?.toString()).toBe('0.9');
    expect(closed.total?.toString()).toBe('1262.5');
  });

  it('linhas de custo ficam gravadas e visíveis — detalhamento, não caixa preta', async () => {
    const quote = await quoteService.createCostBased({
      icmsUf: 'SP',
      marginPercentage: '20',
      costLines: [
        { costTypeId: freightTypeId, amount: '400' },
        { costTypeId: tollTypeId, amount: '300' },
        { costTypeId: fuelTypeId, amount: '120' },
      ],
    });

    const lines = await forTenant(tenant.id).quoteCostLine.findMany({
      where: { quoteId: quote.id },
      include: { costType: true },
    });

    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.costType.code).sort()).toEqual([
      'FREIGHT',
      'FUEL',
      'TOLL',
    ]);
    const sum = lines.reduce(
      (acc, l) => acc.plus(l.amount),
      new Prisma.Decimal(0),
    );
    expect(sum.toString()).toBe('820');
  });

  it('congela: campos de entrada do caminho de custo continuam fora do UPDATE mesmo depois de fechado', async () => {
    const quote = await quoteService.createCostBased({
      icmsUf: 'SP',
      marginPercentage: '20',
      costLines: [{ costTypeId: freightTypeId, amount: '810' }],
    });
    await quoteService.close(quote.id);

    await expect(
      forTenant(tenant.id).quote.update({
        where: { id: quote.id },
        data: { marginPercentage: '99' },
      }),
    ).rejects.toThrow();

    await expect(
      forTenant(tenant.id).quote.update({
        where: { id: quote.id },
        data: { icmsUf: 'RJ' },
      }),
    ).rejects.toThrow();
  });

  it('impede apagar Quote do caminho de custo — histórico, D-017', async () => {
    const quote = await quoteService.createCostBased({
      icmsUf: 'SP',
      marginPercentage: '20',
      costLines: [{ costTypeId: freightTypeId, amount: '810' }],
    });

    await expect(
      forTenant(tenant.id).quote.delete({ where: { id: quote.id } }),
    ).rejects.toThrow();
  });

  it('CHECK do banco recusa uma Quote com os dois caminhos misturados', async () => {
    const openStatus = await admin.quoteStatus.findFirstOrThrow({
      where: { code: 'OPEN' },
    });
    const lane = await admin.lane.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        originCity: 'São Paulo',
        originState: 'SP',
        destinationCity: 'Curitiba',
        destinationState: 'PR',
      },
    });
    const party = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Cliente A',
        cnpj: '11444777000161',
      },
    });
    const freightRate = await admin.freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        partyId: party.id,
        laneId: lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('9999-12-31'),
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });

    // TABELA completa (freightRateId+rate/min/pct) MAIS marginPercentage
    // preenchido — os dois caminhos ao mesmo tempo, o CHECK precisa
    // recusar isso mesmo vindo direto do banco (admin, sem passar pelo
    // serviço).
    await expect(
      admin.quote.create({
        data: {
          id: uuidv7(),
          tenantId: tenant.id,
          statusId: openStatus.id,
          freightRateId: freightRate.id,
          rate: freightRate.rate,
          minimumFreight: freightRate.minimumFreight,
          additionalPercentage: freightRate.additionalPercentage,
          total: '500',
          marginPercentage: '20',
        },
      }),
    ).rejects.toThrow();
  });
});
