-- Sessão opaca (D-048, unidade "a casca do frontend") — substitui o JWT
-- stateless que existia desde a D-029/init_tenant. Ver comentário
-- completo em Session no schema.prisma.
--
-- Nota sobre o diff bruto do Prisma: a linha "DROP INDEX
-- Order_customerReference_trgm_idx" e a recriação do índice único de
-- IbsCbsTaxSituation são os mesmos falsos positivos já documentados nas
-- migrações 20260908060000/20260910010000/20260911000000 — removidas
-- daqui, não fazem parte desta mudança.

-- CreateTable
CREATE TABLE "Session" (
    "token" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "Session_tenantId_idx" ON "Session"("tenantId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (D-012): SELECT público, mesmo mecanismo exato de Tenant.slug
-- (D-029, migração 20260904061352) — validar sessão precisa funcionar
-- antes de existir tenant definido na conexão, porque é a própria
-- sessão que informa qual é o tenant. INSERT/DELETE continuam isolados
-- ao próprio tenant (login já resolveu o tenant antes do INSERT;
-- SessionService.revoke relê o token via SELECT público pra descobrir o
-- tenant, só então apaga escopado).
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" FORCE ROW LEVEL SECURITY;

CREATE POLICY "session_read_public" ON "Session"
  FOR SELECT
  USING (true);

CREATE POLICY "session_insert_isolation" ON "Session"
  FOR INSERT
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

CREATE POLICY "session_delete_isolation" ON "Session"
  FOR DELETE
  USING ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Sessão nunca é atualizada — só criada (login) e apagada (logout ou
-- expiração natural). Revogado no banco, não só por disciplina de nunca
-- chamar UPDATE (D-014, mesmo critério de FreightRate/RiskClearance).
REVOKE UPDATE ON "Session" FROM mash_app;
