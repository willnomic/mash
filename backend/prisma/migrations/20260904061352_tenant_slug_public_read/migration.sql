-- AddColumn
ALTER TABLE "Tenant" ADD COLUMN "slug" VARCHAR(63);

-- Formato reforçado no banco, não só na aplicação: minúsculo, sem espaço
-- (D-029). Backfill não é necessário — não há dado real em produção ainda.
UPDATE "Tenant" SET "slug" = "id"::text WHERE "slug" IS NULL;
ALTER TABLE "Tenant" ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_slug_format"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- D-029: login precisa resolver slug -> tenant antes de existir
-- "app.current_tenant_id" na sessão. A política única de antes (id = tenant
-- da sessão) bloqueava até essa leitura pré-autenticação — falha fechado
-- também para o caso que precisa ficar aberto. Troca por política por
-- comando: SELECT público (nome e slug não são dado sensível), escrita
-- (INSERT/UPDATE/DELETE) continua isolada ao próprio tenant.
DROP POLICY "tenant_isolation" ON "Tenant";

CREATE POLICY "tenant_read_public" ON "Tenant"
  FOR SELECT
  USING (true);

CREATE POLICY "tenant_insert_isolation" ON "Tenant"
  FOR INSERT
  WITH CHECK ("id" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

CREATE POLICY "tenant_update_isolation" ON "Tenant"
  FOR UPDATE
  USING      ("id" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("id" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

CREATE POLICY "tenant_delete_isolation" ON "Tenant"
  FOR DELETE
  USING ("id" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);
