import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';
import { TaxRateService } from '../tax-rate/tax-rate.service.js';
import { calculateQuotePricing } from './quote-pricing-calculator.js';

const QUOTE_STATUS_OPEN = 'OPEN';
const QUOTE_STATUS_CLOSED = 'CLOSED';
const QUOTE_STATUS_LOST = 'LOST';

@Injectable()
export class QuoteService {
  constructor(
    private readonly tenantPrisma: TenantPrisma,
    private readonly taxRateService: TaxRateService,
  ) {}

  // Caminho TABELA (D-018, existente): congela os valores da FreightRate
  // no fechamento — na verdade já congela aqui, na criação (D-014,
  // "nunca recalculado depois"). "total" é informado por quem chama: o
  // cálculo real de frete (peso x tarifa, piso mínimo) ainda não existe.
  async create(input: { freightRateId: string; total: string }) {
    const db = this.tenantPrisma.db;

    const freightRate = await db.freightRate.findUniqueOrThrow({
      where: { id: input.freightRateId },
    });
    const openStatus = await db.quoteStatus.findFirstOrThrow({
      where: { code: QUOTE_STATUS_OPEN },
    });

    return db.quote.create({
      data: {
        id: uuidv7(),
        tenantId: freightRate.tenantId,
        freightRateId: freightRate.id,
        statusId: openStatus.id,
        rate: freightRate.rate,
        minimumFreight: freightRate.minimumFreight,
        additionalPercentage: freightRate.additionalPercentage,
        total: input.total,
      },
    });
  }

  // Caminho CUSTO (D-041, validação de campo: dor nº 1 do operador é
  // "cálculo de tudo, margem, imposto"). Sem FreightRate — o preço só
  // existe depois do fechamento (close()), quando as linhas de custo já
  // estiverem lançadas e a margem já decidida. marginPercentage/icmsUf
  // são fixados aqui e nunca mudam depois (recalcular com outra margem é
  // cotação nova, não edição) — mesmo critério de imutabilidade do
  // caminho TABELA, só que aplicado às ENTRADAS em vez de à SAÍDA.
  async createCostBased(input: {
    icmsUf: string;
    marginPercentage: string;
    costLines: {
      costTypeId: string;
      description?: string;
      amount: string;
    }[];
  }) {
    return this.tenantPrisma.transaction(async (tx, tenantId) => {
      const openStatus = await tx.quoteStatus.findFirstOrThrow({
        where: { code: QUOTE_STATUS_OPEN },
      });

      const quote = await tx.quote.create({
        data: {
          id: uuidv7(),
          tenantId,
          statusId: openStatus.id,
          marginPercentage: input.marginPercentage,
          icmsUf: input.icmsUf,
        },
      });

      if (input.costLines.length > 0) {
        await tx.quoteCostLine.createMany({
          data: input.costLines.map((line) => ({
            id: uuidv7(),
            tenantId,
            quoteId: quote.id,
            costTypeId: line.costTypeId,
            description: line.description,
            amount: line.amount,
          })),
        });
      }

      return quote;
    });
  }

  // Fecha a cotação. Caminho TABELA: só muda status — valores já
  // congelados na criação. Caminho CUSTO (D-041): é AQUI que o preço
  // nasce — soma as linhas de custo, lê as alíquotas vigentes na data do
  // fechamento (D-014: recotar uma data passada usa a alíquota daquela
  // data, não a de hoje — TaxRateService.findRate é parametrizado por
  // data por isso), recompõe imposto e margem
  // (QuotePricingCalculator), e congela tudo: alíquotas usadas, margem
  // aplicada (já congelada desde a criação) e preço final. Arredonda só
  // na saída (D-013) — total é a única coisa arredondada aqui, pro
  // Decimal(14,2) da coluna; o resto do cálculo correu em precisão
  // cheia.
  async close(quoteId: string) {
    return this.tenantPrisma.transaction(async (tx) => {
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: quoteId },
      });
      const closedStatus = await tx.quoteStatus.findFirstOrThrow({
        where: { code: QUOTE_STATUS_CLOSED },
      });

      if (quote.freightRateId !== null) {
        return tx.quote.update({
          where: { id: quoteId },
          data: { statusId: closedStatus.id },
        });
      }

      // Caminho CUSTO — o CHECK "Quote_pricing_path_exclusive" da
      // migração já garante marginPercentage/icmsUf preenchidos quando
      // freightRateId é nulo; a guarda abaixo só estreita o tipo pro
      // TypeScript, o banco é quem garante de verdade.
      if (quote.marginPercentage === null || quote.icmsUf === null) {
        throw new Error(
          'Quote no caminho de custo sem marginPercentage/icmsUf — inconsistência que o CHECK do banco deveria ter impedido.',
        );
      }

      const costLines = await tx.quoteCostLine.findMany({
        where: { quoteId },
      });
      const closingDate = new Date();
      const icmsRate = await this.taxRateService.findRate(tx, {
        taxType: 'ICMS',
        uf: quote.icmsUf,
        date: closingDate,
      });
      const ibsRate = await this.taxRateService.findRate(tx, {
        taxType: 'IBS',
        date: closingDate,
      });
      const cbsRate = await this.taxRateService.findRate(tx, {
        taxType: 'CBS',
        date: closingDate,
      });

      const pricing = calculateQuotePricing({
        costLines: costLines.map((line) => ({ amount: line.amount })),
        icmsRatePercent: icmsRate.rate,
        ibsRatePercent: ibsRate.rate,
        cbsRatePercent: cbsRate.rate,
        marginRatePercent: quote.marginPercentage,
      });

      return tx.quote.update({
        where: { id: quoteId },
        data: {
          statusId: closedStatus.id,
          icmsRateApplied: icmsRate.rate,
          ibsRateApplied: ibsRate.rate,
          cbsRateApplied: cbsRate.rate,
          total: pricing.finalPrice.toDecimalPlaces(2),
        },
      });
    });
  }

  async markLost(quoteId: string) {
    const db = this.tenantPrisma.db;
    const lostStatus = await db.quoteStatus.findFirstOrThrow({
      where: { code: QUOTE_STATUS_LOST },
    });

    return db.quote.update({
      where: { id: quoteId },
      data: { statusId: lostStatus.id },
    });
  }
}
