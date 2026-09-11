import { Controller, Get } from '@nestjs/common';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

// Tabela de domínio (D-020): tenantId nulo = padrão do sistema,
// preenchido = tipo próprio do tenant. A tela lê daqui — não chumba a
// lista (a instrução da unidade é explícita: "leia do banco"). RLS
// (D-012) já filtra: só chega o que é do tenant da sessão mais os
// padrões compartilhados, mesmo mecanismo de DeductionReason/
// QuoteStatus/OrderStatus.
@Controller('quote-cost-types')
export class QuoteCostTypeController {
  constructor(private readonly tenantPrisma: TenantPrisma) {}

  @Get()
  list() {
    return this.tenantPrisma.db.quoteCostType.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
