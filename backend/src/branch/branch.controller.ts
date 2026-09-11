import { Controller, Get } from '@nestjs/common';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

// Leitura simples pra popular o seletor de filial no aceite (D-047) —
// mesmo critério de PartyController: sem paginação, sem cadastro. D-011
// deliberadamente não construiu tela de filial no MVP ("zero tela, zero
// filtro"); isto não é essa tela — é a lista mínima pra escolher qual
// filial o pedido pertence, que accept() já exige.
@Controller('branches')
export class BranchController {
  constructor(private readonly tenantPrisma: TenantPrisma) {}

  @Get()
  list() {
    return this.tenantPrisma.db.branch.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
