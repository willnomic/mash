import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { createBranchSchema } from '@mash/shared';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

// Leitura simples pra popular o seletor de filial no aceite (D-047) —
// mesmo critério de PartyController: sem paginação, sem tela de
// cadastro. D-011 deliberadamente não construiu tela de filial no MVP
// ("zero tela, zero filtro"); isto não é essa tela — é a lista mínima
// pra escolher qual filial o pedido pertence, mais o mesmo tratamento
// de "criar sem sair do fluxo" que a Party ganhou nesta unidade (o
// pedido: "mesmo tratamento, se a filial também não existir").
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

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.tenantPrisma.transaction(async (tx, tenantId) =>
      tx.branch.create({
        data: { id: uuidv7(), tenantId, name: parsed.data.name },
      }),
    );
  }
}
