import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

const QUOTE_STATUS_OPEN = 'OPEN';
const QUOTE_STATUS_CLOSED = 'CLOSED';
const QUOTE_STATUS_LOST = 'LOST';

@Injectable()
export class QuoteService {
  constructor(private readonly tenantPrisma: TenantPrisma) {}

  // Congela os valores da FreightRate no fechamento (D-014) — nunca
  // recalculado depois. "total" é informado por quem chama: o cálculo
  // real de frete (peso x tarifa, piso mínimo) ainda não existe.
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

  async close(quoteId: string) {
    const db = this.tenantPrisma.db;
    const closedStatus = await db.quoteStatus.findFirstOrThrow({
      where: { code: QUOTE_STATUS_CLOSED },
    });

    return db.quote.update({
      where: { id: quoteId },
      data: { statusId: closedStatus.id },
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
