import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

interface OrderParties {
  branchId: string;
  senderId: string;
  recipientId: string;
  tomadorId: string;
}

@Injectable()
export class OrderService {
  constructor(private readonly tenantPrisma: TenantPrisma) {}

  // Caminho 1 (D-018): a partir de uma Quote — copia os valores já
  // congelados nela, sem tocar a FreightRate de novo.
  async createFromQuote(input: OrderParties & { quoteId: string }) {
    const db = this.tenantPrisma.db;
    const quote = await db.quote.findUniqueOrThrow({
      where: { id: input.quoteId },
    });

    return db.order.create({
      data: {
        id: uuidv7(),
        tenantId: quote.tenantId,
        branchId: input.branchId,
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
  // (sem motor de cálculo de frete ainda).
  async createFromFreightRate(
    input: OrderParties & { freightRateId: string; total: string },
  ) {
    const db = this.tenantPrisma.db;
    const freightRate = await db.freightRate.findUniqueOrThrow({
      where: { id: input.freightRateId },
    });

    return db.order.create({
      data: {
        id: uuidv7(),
        tenantId: freightRate.tenantId,
        branchId: input.branchId,
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
  }
}
