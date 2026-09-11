import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import type { Prisma, Quote } from '@prisma/client';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';
import { NumberingService } from '../numbering/numbering.service.js';

const ORDER_STATUS_IN_PROGRESS = 'IN_PROGRESS';

// Quote no caminho CUSTO não guarda cliente/filial nenhum (unidade
// "caminho CUSTO → Order" — confirmado contra o schema antes de
// modelar). Quem decide senderId/recipientId/tomadorId/branchId é
// quem chama, no momento em que o pedido nasce — TABELA sempre
// funcionou assim (createFromQuote já pedia isso de fora), e o caminho
// novo (QuoteService.accept()) segue o mesmo contrato, sem inventar
// campo em Quote pra isso.
export interface OrderParties {
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
  // congelados nela, sem tocar a FreightRate de novo. Abre a própria
  // transação — uso autônomo (fora de QuoteService.accept()).
  async createFromQuote(input: OrderParties & { quoteId: string }) {
    return this.tenantPrisma.transaction(async (tx) => {
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: input.quoteId },
      });
      return this.createOrderFromQuoteInTransaction(tx, quote, input);
    });
  }

  // Núcleo do caminho 1, reaproveitado por QuoteService.accept() (D-046,
  // unidade "caminho CUSTO → Order") — recebe um `tx` já aberto pra criar
  // o Order na MESMA transação do desfecho da cotação, em vez de abrir
  // uma conexão própria (regra 1 de TenantPrisma.transaction():
  // "dentro do callback, use só o tx recebido").
  //
  // Dual-path (D-041, mesmo CHECK espelhado em Order — migração
  // 20260911000000): TABELA copia freightRateId/rate/minimumFreight/
  // additionalPercentage da Quote; CUSTO (Quote sem FreightRate) deixa
  // os quatro nulos — total já cobre o preço nos dois casos. A guarda
  // que recusava o caminho CUSTO foi removida (era só isso: TypeScript
  // aceitando null nos quatro campos já é seguro com eles anuláveis no
  // schema).
  //
  // Número de negócio (D-015) atribuído dentro da MESMA transação do
  // INSERT — não há rascunho de Order, todo Order nasce válido e
  // imutável (D-017), então não existe o cenário do CT-e (número
  // atribuído só na transmissão, pra não gastar número num rascunho
  // descartado). Se a criação falhar depois de pegar o número, o
  // ROLLBACK desfaz o incremento do contador junto — sem buraco.
  async createOrderFromQuoteInTransaction(
    tx: Prisma.TransactionClient,
    quote: Quote,
    input: OrderParties,
  ) {
    // Invariante que vale nos dois caminhos, não guarda de CUSTO: sem
    // preço (Quote ainda não fechada), não há o que congelar em
    // Order.total (NOT NULL). Só estreita o tipo pro TypeScript — quem
    // chama (QuoteService.accept()) já garante isso via
    // assertHasClosedPriceWithoutOutcome() antes de chegar aqui.
    if (quote.total === null) {
      throw new Error(
        'Quote sem total (ainda não fechada) não pode gerar Order.',
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
