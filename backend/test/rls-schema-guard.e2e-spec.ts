import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Teste 5 do guia (docs/d012-multi-tenant-rls.md): pega a falha mais
// provável no dia a dia — criar tabela nova e esquecer a política. Roda uma
// vez para o schema inteiro, não por tabela, porque é o mesmo risco em
// qualquer uma delas. Checa TODA tabela de "public" (não só as que têm
// coluna tenantId): o Tenant usa "id" como a própria fronteira e não teria
// aparecido numa busca por coluna.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('RLS · guarda de schema (D-012)', () => {
  afterAll(async () => {
    await admin.$disconnect();
  });

  it('toda tabela do schema public tem RLS forçado', async () => {
    const unprotected = await admin.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname <> '_prisma_migrations'
        AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
    `;

    expect(unprotected).toEqual([]);
  });
});
