import { Controller, Get } from '@nestjs/common';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

// Leitura simples pra popular seletor (remetente/destinatário/tomador,
// D-047) — sem paginação, sem busca, sem "criar novo" inline. Cadastro
// de Party (tela própria, combobox com criação rápida, D-048) é
// modelagem que ainda não existe — fora desta unidade. Só parte ATIVA
// (D-017: inativar é estado, não remoção — parte inativa não deveria
// aparecer pra escolher num pedido novo).
@Controller('parties')
export class PartyController {
  constructor(private readonly tenantPrisma: TenantPrisma) {}

  @Get()
  list() {
    return this.tenantPrisma.db.party.findMany({
      where: { active: true },
      select: { id: true, name: true, cnpj: true, cpf: true },
      orderBy: { name: 'asc' },
    });
  }
}
