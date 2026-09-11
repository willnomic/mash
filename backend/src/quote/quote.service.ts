import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import {
  computeQuoteValidUntil,
  isQuoteValidityExpired,
  type QuoteValidityTerm,
  calculateQuotePricing,
} from '@mash/shared';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';
import { TaxRateService } from '../tax-rate/tax-rate.service.js';
import { OrderService, type OrderParties } from '../order/order.service.js';

const QUOTE_STATUS_OPEN = 'OPEN';
const QUOTE_STATUS_CLOSED = 'CLOSED';
// Status inicial da Trip recém-criada (unidade "caminho CUSTO → Order")
// — só duas linhas existem hoje (D-018): esta e IN_TRANSIT. Nenhuma das
// duas descreve exatamente "criada, sem motorista/veículo ainda", mas
// "aguardando liberação de risco" é verdade de qualquer forma (D-023:
// liberação é exigida antes de QUALQUER carregamento, independente de
// motorista/veículo já estarem atribuídos) — reaproveitada em vez de
// semear status novo não pedido nesta unidade.
const TRIP_STATUS_PENDING_RISK_CLEARANCE = 'PENDING_RISK_CLEARANCE';
// Reaproveitado como a recusa explícita do cliente (ver reject()) — não
// existe status separado pra isso, confirmado antes de modelar a
// unidade "ciclo de vida da Quote": a linha já era semeada
// (20260904075346, code LOST) e não tinha semântica fixada em código
// nem teste. Renomeada code/name pra REJECTED/"Recusada"
// (20260910020000_rename_quote_status_lost_to_rejected) — LOST
// descrevia mal o que sobrou depois que "cliente sumiu" ficou fora do
// escopo do status (esse caso é derivado, ver QuoteStatus no
// schema.prisma).
const QUOTE_STATUS_REJECTED = 'REJECTED';
const QUOTE_STATUS_ACCEPTED = 'ACCEPTED';

@Injectable()
export class QuoteService {
  constructor(
    private readonly tenantPrisma: TenantPrisma,
    private readonly taxRateService: TaxRateService,
    private readonly orderService: OrderService,
  ) {}

  // Caminho TABELA (D-018, existente): congela os valores da FreightRate
  // no fechamento — na verdade já congela aqui, na criação (D-014,
  // "nunca recalculado depois"). "total" é informado por quem chama: o
  // cálculo real de frete (peso x tarifa, piso mínimo) ainda não existe.
  //
  // partyId (unidade "vincular cliente à Quote") não é parâmetro aqui:
  // uma FreightRate já é negociada com uma Party só (D-014,
  // FreightRate.partyId) — quem pediu a cotação por tabela é
  // necessariamente essa mesma Party, derivar evita pedir de novo algo
  // que o dado de entrada já garante.
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
        partyId: freightRate.partyId,
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
    partyId: string;
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
          partyId: input.partyId,
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
  //
  // options.validityTerm: opcional — cotação sem prazo combinado fecha
  // sem validUntil (nunca expira, ver isQuoteValidityExpired em
  // @mash/shared). Quando informado, validUntil é calculado a partir da
  // MESMA data de fechamento usada pra ler as alíquotas (closingDate),
  // nos dois caminhos — inclusive TABELA, que hoje só muda status aqui.
  //
  // options.quantity: opcional (unidade "caminho CUSTO → Order") —
  // quantidade de viagens, congelada aqui pelo mesmo mecanismo de GRANT
  // de coluna de validUntil. Sem informar, mantém o valor atual da
  // coluna (1, se nunca mudado — DEFAULT da migração). accept() lê este
  // valor pra decidir quantas Trip criar.
  async close(
    quoteId: string,
    options?: { validityTerm?: QuoteValidityTerm; quantity?: number },
  ) {
    return this.tenantPrisma.transaction(async (tx) => {
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: quoteId },
      });
      const closedStatus = await tx.quoteStatus.findFirstOrThrow({
        where: { code: QUOTE_STATUS_CLOSED },
      });
      const closingDate = new Date();
      const validUntil = options?.validityTerm
        ? computeQuoteValidUntil(closingDate, options.validityTerm)
        : null;

      if (quote.freightRateId !== null) {
        return tx.quote.update({
          where: { id: quoteId },
          data: {
            statusId: closedStatus.id,
            validUntil,
            quantity: options?.quantity,
          },
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
        // D-043: vem da vigência da própria linha de TaxRate, não de
        // constante no código — durante a calibragem (2026) as linhas
        // de IBS/CBS nascem com composesPrice=false (migração
        // 20260909000000), então esses dois ficam false aqui também,
        // sem precisar de lógica nova nesta chamada.
        ibsComposesPrice: ibsRate.composesPrice,
        cbsRatePercent: cbsRate.rate,
        cbsComposesPrice: cbsRate.composesPrice,
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
          validUntil,
          quantity: options?.quantity,
        },
      });
    });
  }

  // Registra o desfecho positivo — cliente aceitou a proposta — e cria o
  // pedido, na MESMA transação (unidade "caminho CUSTO → Order"):
  // Quote no caminho CUSTO não guarda cliente/filial nenhum (confirmado
  // contra o schema antes de modelar), então orderInput é obrigatório e
  // sem default silencioso — falta um dos quatro campos, falha explícita
  // (TypeScript já exige os quatro; nada aqui inventa filial ou tomador).
  //
  // Duas guardas de serviço (não dá pra garantir no banco — CHECK não
  // enxerga a data atual nem o code da QuoteStatus referenciada por
  // statusId): preço precisa estar fechado, e vencimento (se houver)
  // não pode ter passado. assertHasClosedPriceWithoutOutcome() também
  // cobre "já tem desfecho" — ACCEPTED/REJECTED nunca são CLOSED.
  //
  // N = quote.quantity Trip, cada uma com o preço unitário da cotação
  // (quote.total) — motorista, veículo e destino nascem nulos, de
  // propósito (preenchidos na operação, não na cotação — Quote no
  // caminho CUSTO também não carrega rota nenhuma pra isso).
  async accept(quoteId: string, orderInput: OrderParties) {
    return this.tenantPrisma.transaction(async (tx) => {
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: quoteId },
        include: { status: true },
      });

      this.assertHasClosedPriceWithoutOutcome(quote);

      if (isQuoteValidityExpired(quote.validUntil, new Date())) {
        throw new Error(
          'Cotação vencida (validUntil já passou) — não pode ser aceita.',
        );
      }
      // Invariante que o CHECK do banco já deveria garantir (Quote
      // CLOSED sempre tem total) — só estreita o tipo pro TypeScript,
      // Order.total e Trip.price são NOT NULL.
      if (quote.total === null) {
        throw new Error(
          'Cotação fechada sem total — inconsistência que o CHECK do banco deveria ter impedido.',
        );
      }

      const acceptedStatus = await tx.quoteStatus.findFirstOrThrow({
        where: { code: QUOTE_STATUS_ACCEPTED },
      });
      await tx.quote.update({
        where: { id: quoteId },
        data: { statusId: acceptedStatus.id },
      });

      const order = await this.orderService.createOrderFromQuoteInTransaction(
        tx,
        quote,
        orderInput,
      );

      const tripStatus = await tx.tripStatus.findFirstOrThrow({
        where: { code: TRIP_STATUS_PENDING_RISK_CLEARANCE },
      });
      for (let sequence = 1; sequence <= quote.quantity; sequence += 1) {
        await tx.trip.create({
          data: {
            id: uuidv7(),
            tenantId: quote.tenantId,
            branchId: orderInput.branchId,
            orderId: order.id,
            sequence,
            price: quote.total,
            statusId: tripStatus.id,
          },
        });
      }

      return order;
    });
  }

  // Registra o desfecho negativo — cliente recusou a proposta
  // (reaproveita QuoteStatus REJECTED/"Recusada", ver comentário no
  // topo do arquivo). Diferente de accept(): cotação vencida pode ser
  // recusada normalmente — só o aceite tem a guarda de vencimento.
  async reject(quoteId: string) {
    return this.tenantPrisma.transaction(async (tx) => {
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: quoteId },
        include: { status: true },
      });

      this.assertHasClosedPriceWithoutOutcome(quote);

      const rejectedStatus = await tx.quoteStatus.findFirstOrThrow({
        where: { code: QUOTE_STATUS_REJECTED },
      });

      return tx.quote.update({
        where: { id: quoteId },
        data: { statusId: rejectedStatus.id },
      });
    });
  }

  private assertHasClosedPriceWithoutOutcome(quote: {
    status: { code: string };
  }) {
    const hasOutcome =
      quote.status.code === QUOTE_STATUS_ACCEPTED ||
      quote.status.code === QUOTE_STATUS_REJECTED;
    if (hasOutcome) {
      throw new Error('Cotação já tem desfecho registrado.');
    }
    if (quote.status.code !== QUOTE_STATUS_CLOSED) {
      throw new Error(
        'Cotação sem preço fechado — feche (close()) antes de registrar aceite ou recusa.',
      );
    }
  }
}
