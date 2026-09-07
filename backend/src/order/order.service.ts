import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';
import { NumberingService } from '../numbering/numbering.service.js';

interface OrderParties {
  branchId: string;
  senderId: string;
  recipientId: string;
  tomadorId: string;
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

      const number = await this.numberingService.nextNumber(tx, {
        tenantId: quote.tenantId,
        branchId: input.branchId,
        documentType: 'ORDER',
      });

      return tx.order.create({
        data: {
          id: uuidv7(),
          tenantId: quote.tenantId,
          branchId: input.branchId,
          number,
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

      return tx.order.create({
        data: {
          id: uuidv7(),
          tenantId: freightRate.tenantId,
          branchId: input.branchId,
          number,
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
