import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { computeQuoteValidUntil } from '@mash/shared';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureQuoteCostTypesSeeded } from './helpers/seed-quote-cost-types.js';
import { ensureOrderStatusesSeeded } from './helpers/seed-order-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { QuoteService } from '../src/quote/quote.service.js';
import { TaxRateService } from '../src/tax-rate/tax-rate.service.js';
import { TenantPrisma } from '../src/tenant/tenant-prisma.service.js';
import { OrderService, type OrderParties } from '../src/order/order.service.js';
import { NumberingService } from '../src/numbering/numbering.service.js';

// Roda contra o PostgreSQL real do docker-compose — as guardas testadas
// aqui (D-045-like, unidade "ciclo de vida da Quote": desfecho, validade
// e revisão) são de serviço, não de CHECK (o banco não enxerga a data
// atual nem o código da QuoteStatus referenciada por statusId), então só
// um teste rodando o serviço de verdade prova alguma coisa.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function tenantPrismaFor(tenantId: string): TenantPrisma {
  const fakeCls = { get: () => tenantId } as unknown as ClsService;
  return new TenantPrisma(fakeCls);
}

const TRUNCATE = `TRUNCATE TABLE "QuoteCostLine", "Quote", "QuoteCostType", "QuoteStatus", "Tenant" CASCADE`;

describe('Quote · ciclo de vida — desfecho, validade e revisão', () => {
  let tenant: { id: string };
  let branch: { id: string };
  let party: { id: string };
  let quoteService: QuoteService;
  let freightTypeId: string;

  async function createOpenQuote() {
    return quoteService.createCostBased({
      partyId: party.id,
      icmsUf: 'SP',
      marginPercentage: '20',
      costLines: [{ costTypeId: freightTypeId, amount: '810' }],
    });
  }

  // Quote no caminho CUSTO não guarda cliente/filial (unidade "caminho
  // CUSTO → Order") — accept() exige isso de fora, mesmo contrato que
  // OrderService.createFromQuote() já usava pro caminho TABELA.
  function defaultOrderInput(): OrderParties {
    return {
      branchId: branch.id,
      senderId: party.id,
      recipientId: party.id,
      tomadorId: party.id,
    };
  }

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);
    await ensureOrderStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);

    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    branch = await admin.branch.create({
      data: { id: uuidv7(), tenantId: tenant.id, name: 'Matriz' },
    });
    party = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Cliente A',
        cnpj: '11444777000161',
      },
    });
    freightTypeId = (
      await admin.quoteCostType.findFirstOrThrow({ where: { code: 'FREIGHT' } })
    ).id;

    const tenantPrisma = tenantPrismaFor(tenant.id);
    quoteService = new QuoteService(
      tenantPrisma,
      new TaxRateService(),
      new OrderService(tenantPrisma, new NumberingService()),
    );
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);
    await ensureOrderStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  describe('validUntil (D-016, exceção de calendário)', () => {
    it('close() sem prazo deixa validUntil nulo — cotação nunca expira', async () => {
      const quote = await createOpenQuote();
      const closed = await quoteService.close(quote.id);

      expect(closed.validUntil).toBeNull();

      await quoteService.accept(quote.id, defaultOrderInput());
      const quoteAfterAccept = await admin.quote.findUniqueOrThrow({
        where: { id: quote.id },
      });
      expect(quoteAfterAccept.validUntil).toBeNull();
    });

    it('close() com prazo em dias calcula validUntil via @mash/shared', async () => {
      const quote = await createOpenQuote();
      const before = new Date();
      const closed = await quoteService.close(quote.id, {
        validityTerm: { unit: 'DAYS', amount: 30 },
      });

      expect(closed.validUntil).not.toBeNull();
      const expected = computeQuoteValidUntil(before, { unit: 'DAYS', amount: 30 });
      expect(closed.validUntil?.toISOString().slice(0, 10)).toBe(
        expected.toISOString().slice(0, 10),
      );
    });

    it('close() no caminho TABELA também congela validUntil (não só CUSTO)', async () => {
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
      const quote = await quoteService.create({
        freightRateId: freightRate.id,
        total: '500',
      });

      const closed = await quoteService.close(quote.id, {
        validityTerm: { unit: 'MONTHS', amount: 1 },
      });

      expect(closed.validUntil).not.toBeNull();
    });
  });

  describe('accept()/reject() — guardas de serviço (não dá pra garantir no banco)', () => {
    it('accept() recusa cotação ainda não fechada', async () => {
      const quote = await createOpenQuote();

      await expect(quoteService.accept(quote.id, defaultOrderInput())).rejects.toThrow(
        /preço fechado/,
      );
    });

    it('reject() recusa cotação ainda não fechada', async () => {
      const quote = await createOpenQuote();

      await expect(quoteService.reject(quote.id)).rejects.toThrow(
        /preço fechado/,
      );
    });

    it('accept() recusa cotação vencida', async () => {
      const quote = await createOpenQuote();
      await quoteService.close(quote.id, { validityTerm: { unit: 'DAYS', amount: -1 } });

      await expect(quoteService.accept(quote.id, defaultOrderInput())).rejects.toThrow(/vencida/);
    });

    it('reject() aceita cotação vencida normalmente — só accept() tem a guarda de vencimento', async () => {
      const quote = await createOpenQuote();
      await quoteService.close(quote.id, { validityTerm: { unit: 'DAYS', amount: -1 } });

      const rejected = await quoteService.reject(quote.id);
      const status = await admin.quoteStatus.findUniqueOrThrow({
        where: { id: rejected.statusId },
      });
      expect(status.code).toBe('REJECTED');
    });

    it('accept() recusa cotação que já tem desfecho (dupla tentativa)', async () => {
      const quote = await createOpenQuote();
      await quoteService.close(quote.id);
      await quoteService.accept(quote.id, defaultOrderInput());

      await expect(quoteService.accept(quote.id, defaultOrderInput())).rejects.toThrow(
        /já tem desfecho/,
      );
    });

    it('reject() recusa cotação que já tem desfecho (accept seguido de reject)', async () => {
      const quote = await createOpenQuote();
      await quoteService.close(quote.id);
      await quoteService.accept(quote.id, defaultOrderInput());

      await expect(quoteService.reject(quote.id)).rejects.toThrow(
        /já tem desfecho/,
      );
    });

    it('reject() recusa cotação que já tem desfecho (dupla tentativa)', async () => {
      const quote = await createOpenQuote();
      await quoteService.close(quote.id);
      await quoteService.reject(quote.id);

      await expect(quoteService.reject(quote.id)).rejects.toThrow(
        /já tem desfecho/,
      );
    });
  });

  // As três guardas acima são de SERVIÇO — o banco não tem como
  // enxergar "hoje" nem o code da QuoteStatus referenciada por statusId
  // sem subquery (CHECK não aceita). Diferente do CHECK de caminho
  // exclusivo da D-041 (que compara só colunas da própria linha), aqui
  // não existe equivalente possível: os três testes abaixo provam,
  // deliberadamente, que ir direto ao banco (mesma credencial mash_app
  // que o serviço usa) NÃO esbarra em barreira nenhuma — documentando o
  // gap, não escondendo-o.
  describe('por fora do serviço — onde o banco NÃO consegue barrar (documentado)', () => {
    it('admin.quote.update aceita direto uma cotação ainda aberta, sem CHECK que impeça', async () => {
      const quote = await createOpenQuote();
      const acceptedStatus = await admin.quoteStatus.findFirstOrThrow({
        where: { code: 'ACCEPTED' },
      });

      await expect(
        forTenant(tenant.id).quote.update({
          where: { id: quote.id },
          data: { statusId: acceptedStatus.id },
        }),
      ).resolves.toBeTruthy();
    });

    it('admin.quote.update grava um segundo desfecho por cima do primeiro, sem CHECK que impeça', async () => {
      const quote = await createOpenQuote();
      await quoteService.close(quote.id);
      await quoteService.accept(quote.id, defaultOrderInput());
      const rejectedStatus = await admin.quoteStatus.findFirstOrThrow({
        where: { code: 'REJECTED' },
      });

      await expect(
        forTenant(tenant.id).quote.update({
          where: { id: quote.id },
          data: { statusId: rejectedStatus.id },
        }),
      ).resolves.toBeTruthy();
    });

    it('admin.quote.update aceita cotação vencida, sem CHECK que impeça', async () => {
      const quote = await createOpenQuote();
      await quoteService.close(quote.id, { validityTerm: { unit: 'DAYS', amount: -1 } });
      const acceptedStatus = await admin.quoteStatus.findFirstOrThrow({
        where: { code: 'ACCEPTED' },
      });

      await expect(
        forTenant(tenant.id).quote.update({
          where: { id: quote.id },
          data: { statusId: acceptedStatus.id },
        }),
      ).resolves.toBeTruthy();
    });
  });

  describe('previousQuoteId — revisão/recotação (schema apenas, sem caminho de criação no serviço)', () => {
    it('CHECK recusa autorreferência', async () => {
      const quote = await createOpenQuote();

      await expect(
        admin.quote.update({
          where: { id: quote.id },
          data: { previousQuoteId: quote.id },
        }),
      ).rejects.toThrow();
    });

    it('aceita apontar pra outra Quote do mesmo tenant, e a relação inversa (revisions) enxerga', async () => {
      const parent = await createOpenQuote();
      const child = await createOpenQuote();

      await admin.quote.update({
        where: { id: child.id },
        data: { previousQuoteId: parent.id },
      });

      const parentWithRevisions = await admin.quote.findUniqueOrThrow({
        where: { id: parent.id },
        include: { revisions: true },
      });
      expect(parentWithRevisions.revisions.map((r) => r.id)).toEqual([
        child.id,
      ]);
    });

    it('congela: previousQuoteId fora do GRANT, mash_app não consegue mudar depois de criado', async () => {
      const parent = await createOpenQuote();
      const child = await createOpenQuote();

      await expect(
        forTenant(tenant.id).quote.update({
          where: { id: child.id },
          data: { previousQuoteId: parent.id },
        }),
      ).rejects.toThrow();
    });
  });
});
