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

  // O teste acima só prova que RLS está LIGADO em toda tabela — não prova
  // que a POLÍTICA isola por tenant. TaxRate (D-041) e Tenant (D-029) são
  // exceções deliberadas, com política `USING (true)` — sem fronteira de
  // tenant nenhuma. Isso é fácil de confundir com "RLS quebrado" ao ler
  // só o teste acima; este teste torna a exceção explícita, com o motivo,
  // em vez de deixar as duas se misturarem na varredura genérica.
  it('TaxRate é exceção deliberada, sem isolamento de tenant — é lei, não configuração (D-041)', async () => {
    const policies = await admin.$queryRaw<
      { qual: string | null; withCheck: string | null }[]
    >`
      SELECT qual, with_check AS "withCheck"
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'TaxRate'
    `;

    expect(policies).toHaveLength(1);
    // "true" — não "tenantId = ...". Se algum dia essa política passar a
    // filtrar por tenant, é uma mudança de modelo (TaxRate virando
    // configurável por tenant) que merece decisão própria em
    // decisoes.md, não um ajuste silencioso que este teste deixaria
    // passar batido.
    expect(policies[0].qual?.trim()).toBe('true');
    expect(policies[0].withCheck?.trim()).toBe('true');
  });

  it('Tenant.slug é a outra exceção deliberada, mesmo mecanismo (D-029)', async () => {
    const policies = await admin.$queryRaw<
      { cmd: string; qual: string | null }[]
    >`
      SELECT cmd, qual
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'Tenant'
    `;

    // D-029: SELECT é público (login precisa resolver o slug antes de
    // existir tenant na sessão) — política própria, separada das de
    // INSERT/UPDATE/DELETE, que continuam isoladas ao próprio tenant.
    // Diferente de TaxRate (uma política `FOR ALL` sem fronteira
    // nenhuma): aqui só a leitura é pública.
    const selectPolicy = policies.find((p) => p.cmd === 'SELECT');
    expect(selectPolicy?.qual?.trim()).toBe('true');
    expect(policies.some((p) => p.cmd !== 'SELECT')).toBe(true);
  });
});
