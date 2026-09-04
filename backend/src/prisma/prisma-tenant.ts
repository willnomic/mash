import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Conecta como mash_app — sem posse de tabela, para que FORCE ROW LEVEL
// SECURITY se aplique (docs/d012-multi-tenant-rls.md, Passo 1). Nunca usar
// DATABASE_URL (dono) aqui: isso desligaria o RLS silenciosamente.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_APP,
});

export const base = new PrismaClient({ adapter });

// Cliente escopado a um tenant. Define app.current_tenant_id na mesma
// transação da consulta, com set_config e parâmetro vinculado — nunca
// SET LOCAL com interpolação de string, que abriria injeção de SQL na
// camada que sustenta o isolamento (docs/d012-multi-tenant-rls.md, Passo 3).
export function forTenant(tenantId: string) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
      // $allModels/$allOperations só cobre operação de modelo (create,
      // findMany, ...). $queryRaw e $executeRaw são chamadas de nível de
      // cliente e passam por fora desse gancho — precisam do próprio.
      async $queryRaw({ args, query }) {
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
          query(args),
        ]);
        return result;
      },
      async $executeRaw({ args, query }) {
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
          query(args),
        ]);
        return result;
      },
    },
  });
}
