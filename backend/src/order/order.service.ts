import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';
import { NumberingService } from '../numbering/numbering.service.js';

const ORDER_STATUS_IN_PROGRESS = 'IN_PROGRESS';

interface OrderParties {
  branchId: string;
  senderId: string;
  recipientId: string;
  tomadorId: string;
  // Referência do cliente (D-038) — opcional, é por ela que o operador
  // acha o pedido, não pelo number interno. Sem motor de busca aqui;
  // quem chama já traz o valor pronto.
  customerReference?: string;
}

@Injectable()
export class OrderService {
  constructor(
    private readonly tenantPrisma: TenantPrisma,
    private readonly numberingService: NumberingService,
  ) {}

  // Caminho 1 (D-018): a partir de uma Quote — copia os valores já
  // congelados nela, sem tocar a FreightRate de novo.
  //
  // Número de negócio (D-015) atribuído dentro da MESMA transação do
  // INSERT — não há rascunho de Order, todo Order nasce válido e
  // imutável (D-017), então não existe o cenário do CT-e (número
  // atribuído só na transmissão, pra não gastar número num rascunho
  // descartado). Se a criação falhar depois de pegar o número, o
  // ROLLBACK desfaz o incremento do contador junto — sem buraco.
  async createFromQuote(input: OrderParties & { quoteId: string }) {
    return this.tenantPrisma.transaction(async (tx) => {
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: input.quoteId },
      });
      // Quote agora tem dois caminhos de precificação (D-041): TABELA
      // (freightRateId+rate/minimumFreight/additionalPercentage) e CUSTO
      // (marginPercentage+icmsUf, sem FreightRate). Order só sabe
      // congelar o caminho TABELA — não foi pedido estender Order pro
      // caminho CUSTO nesta unidade. Guarda explícita em vez de deixar o
      // TypeScript aceitar null silenciosamente nos campos abaixo.
      if (
        quote.freightRateId === null ||
        quote.rate === null ||
        quote.minimumFreight === null ||
        quote.additionalPercentage === null ||
        quote.total === null
      ) {
        throw new Error(
          'Quote sem FreightRate (caminho de custo, D-041) não pode gerar Order ainda — caminho não implementado.',
        );
      }

      const number = await this.numberingService.nextNumber(tx, {
        tenantId: quote.tenantId,
        branchId: input.branchId,
        documentType: 'ORDER',
      });
      // Todo pedido nasce "em andamento" (D-038) — mesmo padrão do
      // QuoteService.create buscando o status "aberta" por código.
      const status = await tx.orderStatus.findFirstOrThrow({
        where: { code: ORDER_STATUS_IN_PROGRESS },
      });

      return tx.order.create({
        data: {
          id: uuidv7(),
          tenantId: quote.tenantId,
          branchId: input.branchId,
          number,
          customerReference: input.customerReference,
          statusId: status.id,
          quoteId: quote.id,
          freightRateId: quote.freightRateId,
          senderId: input.senderId,
          recipientId: input.recipientId,
          tomadorId: input.tomadorId,
          rate: quote.rate,
          minimumFreight: quote.minimumFreight,
          additionalPercentage: quote.additionalPercentage,
          total: quote.total,
        },
      });
    });
  }

  // Caminho 2 (D-018): sem Quote — consulta a FreightRate na criação e já
  // congela os valores ali mesmo. "total" é informado por quem chama
  // (sem motor de cálculo de frete ainda). Mesmo critério de numeração
  // do caminho 1.
  async createFromFreightRate(
    input: OrderParties & { freightRateId: string; total: string },
  ) {
    return this.tenantPrisma.transaction(async (tx) => {
      const freightRate = await tx.freightRate.findUniqueOrThrow({
        where: { id: input.freightRateId },
      });

      const number = await this.numberingService.nextNumber(tx, {
        tenantId: freightRate.tenantId,
        branchId: input.branchId,
        documentType: 'ORDER',
      });
      const status = await tx.orderStatus.findFirstOrThrow({
        where: { code: ORDER_STATUS_IN_PROGRESS },
      });

      return tx.order.create({
        data: {
          id: uuidv7(),
          tenantId: freightRate.tenantId,
          branchId: input.branchId,
          number,
          customerReference: input.customerReference,
          statusId: status.id,
          quoteId: null,
          freightRateId: freightRate.id,
          senderId: input.senderId,
          recipientId: input.recipientId,
          tomadorId: input.tomadorId,
          rate: freightRate.rate,
          minimumFreight: freightRate.minimumFreight,
          additionalPercentage: freightRate.additionalPercentage,
          total: input.total,
        },
      });
    });
  }
}
