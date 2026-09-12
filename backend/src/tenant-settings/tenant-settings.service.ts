import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import type { QuoteValidityDecision } from '@mash/shared';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';
import {
  fromQuoteValidityDecision,
  toQuoteValidityDecision,
} from './quote-validity-mapping.js';

// Configuração do tenant (unidade "configuração do tenant — prazo
// padrão de validade da cotação") — porta única, mesmo espírito do
// SettingsService que a D-020 previa desde o primeiro dia. Só um
// campo hoje (defaultQuoteValidity); mais configuração é método novo
// aqui, não tabela nova.
@Injectable()
export class TenantSettingsService {
  constructor(private readonly tenantPrisma: TenantPrisma) {}

  // NULO = ninguém configurou (a linha nem existe — nunca criada
  // automaticamente, ver comentário no schema.prisma). Não confundir
  // com {type:'NEVER'}, que É uma linha, com unit='NEVER' gravado.
  async getDefaultQuoteValidity(): Promise<QuoteValidityDecision | null> {
    const settings = await this.tenantPrisma.db.tenantSettings.findFirst();
    return toQuoteValidityDecision(settings);
  }

  // Upsert: a linha nasce na primeira vez que o gestor salva (nunca
  // antes) — tenantId é @unique, então upsert por tenantId é o próprio
  // mecanismo de "criar se não existe, atualizar se existe" sem
  // precisar ler antes.
  async updateDefaultQuoteValidity(
    decision: QuoteValidityDecision,
  ): Promise<QuoteValidityDecision> {
    const data = fromQuoteValidityDecision(decision);
    await this.tenantPrisma.transaction(async (tx, tenantId) => {
      await tx.tenantSettings.upsert({
        where: { tenantId },
        create: { id: uuidv7(), tenantId, ...data },
        update: data,
      });
    });
    return decision;
  }
}
