-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- Isolamento (D-012): a política falha fechado — sem "app.current_tenant_id"
-- definido na sessão, current_setting(..., TRUE) retorna NULL e nenhuma
-- linha aparece. "id" faz o papel de tenantId aqui, porque a linha do
-- Tenant é a própria fronteira: cada tenant só enxerga a si mesmo.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;

-- nullif(..., '') antes do cast: numa conexão vinda de pool, depois que
-- QUALQUER transação já usou set_config(..., TRUE) uma vez, o valor local
-- não volta a NULL ao fazer commit — volta a '' (string vazia). Um cast
-- direto de '' para uuid dá erro em vez de falhar fechado com zero linhas.
-- Verificado nesta sessão contra o Postgres 17 do container; documentado
-- em docs/d012-multi-tenant-rls.md.
CREATE POLICY tenant_isolation ON "Tenant"
  USING      ("id" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("id" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Grants do role de aplicação (mash_app, criado em docker/init-db.sql).
-- Vivem aqui, não só no script de init do container: "prisma migrate
-- reset" recria o schema "public" do zero a cada execução, e um DROP
-- SCHEMA/CREATE SCHEMA apaga silenciosamente qualquer GRANT feito fora
-- da migração (docs/d012-multi-tenant-rls.md, Passo 1).
GRANT USAGE ON SCHEMA public TO mash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mash_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mash_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mash_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mash_app;
