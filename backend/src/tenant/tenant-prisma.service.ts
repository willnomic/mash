import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { base, forTenant } from '../prisma/prisma-tenant.js';

// Serviços injetam TenantPrisma e usam this.tenantPrisma.db.<model> — o
// tenantId nunca aparece no código de negócio (docs/d012-multi-tenant-rls.md,
// Passo 4).
@Injectable()
export class TenantPrisma {
  constructor(private readonly cls: ClsService) {}

  private get tenantId(): string {
    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) {
      throw new InternalServerErrorException('tenant ausente no contexto');
    }
    return tenantId;
  }

  get db() {
    return forTenant(this.tenantId);
  }

  // Operações de negócio com mais de um passo que precisam ser atômicas
  // (docs/d012-multi-tenant-rls.md, Passo 3) — ex.: atribuir número de
  // negócio (D-015) na mesma transação que grava a entidade, pra que um
  // ROLLBACK desfaça as duas coisas juntas. `db` (acima) não serve aqui:
  // cada operação nele abre a própria mini-transação via
  // base.$transaction([...]) (prisma-tenant.ts), então chamadas dentro de
  // um db.$transaction(...) não compartilhariam conexão nem contexto de
  // tenant com o que roda aqui. set_config é chamado uma vez só, no
  // início, igual TenantsService.create().
  //
  // PRIMITIVO DE USO RESTRITO (D-035): contorna o caminho normal do
  // forTenant() e abre a transação direto no client base — é o mesmo
  // poder que, usado errado, fura o isolamento entre tenants (D-012) em
  // silêncio (RLS "existe", os outros testes passam, e nenhum sintoma
  // aparece até alguém notar em produção). Prova de que hoje não fura:
  // test/tenant-prisma-transaction-rls.e2e-spec.ts. Três regras, sempre:
  // 1. Dentro do callback, use só o `tx` recebido — nunca
  //    `this.tenantPrisma.db` nem um PrismaClient novo. `db` abriria sua
  //    própria mini-transação numa conexão DIFERENTE, sem o tenant
  //    configurado nela.
  // 2. Nunca deixe o `tx` escapar do callback (guardado numa variável,
  //    devolvido, usado depois). Depois que transaction() retorna, a
  //    conexão já voltou pro pool — usar o `tx` fora daqui é usar uma
  //    transação que não existe mais.
  // 3. Prende uma conexão do pool (max 10, node-postgres) pelo tempo
  //    inteiro do callback — não chamar pra operação de duração longa ou
  //    imprevisível, sob risco de esgotar o pool.
  // Segundo argumento do callback (tenantId) é o mesmo valor já usado
  // pro set_config acima — exposto porque criar uma entidade "raiz" sem
  // nenhum pai do qual derivar o tenantId (ex.: QuoteService.
  // createCostBased, D-041) precisa do valor pra gravar a coluna, e sem
  // isso o único jeito seria a própria regra de negócio ler ClsService
  // direto, violando "tenantId nunca aparece no código de negócio"
  // (tenant-prisma.service.ts, topo do arquivo). Continua vindo só
  // daqui, não de um segundo caminho.
  transaction<T>(
    fn: (tx: Prisma.TransactionClient, tenantId: string) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.tenantId;
    return base.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
      return fn(tx, tenantId);
    });
  }
}
