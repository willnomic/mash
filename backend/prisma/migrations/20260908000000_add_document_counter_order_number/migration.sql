-- CreateEnum
CREATE TYPE "BusinessDocumentType" AS ENUM ('ORDER');

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "documentType" "BusinessDocumentType" NOT NULL,
    "series" TEXT NOT NULL DEFAULT '1',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCounter_tenantId_branchId_documentType_series_key"
  ON "DocumentCounter"("tenantId", "branchId", "documentType", "series");

-- AddForeignKey
ALTER TABLE "DocumentCounter" ADD CONSTRAINT "DocumentCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCounter" ADD CONSTRAINT "DocumentCounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Isolamento (D-012), mesmo padrão das demais tabelas.
ALTER TABLE "DocumentCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentCounter" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "DocumentCounter"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Único UPDATE legítimo é o incremento do contador (D-015). Identidade
-- da linha (tenantId/branchId/documentType/series) nunca muda depois de
-- criada — mesmo mecanismo de GRANT por coluna do FreightRate/Quote.
REVOKE UPDATE ON "DocumentCounter" FROM mash_app;
GRANT UPDATE ("lastNumber", "updatedAt") ON "DocumentCounter" TO mash_app;

-- DELETE revogado: apagar um contador reabriria os números já emitidos
-- pra reuso na próxima linha inserida — quebraria a unicidade que a
-- numeração existe pra garantir.
REVOKE DELETE ON "DocumentCounter" FROM mash_app;

-- AlterTable: número de negócio do Order (D-015). Não há linha existente
-- (tabela vazia nesta sessão) — NOT NULL direto, sem precisar de default
-- nem backfill.
ALTER TABLE "Order" ADD COLUMN "number" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_branchId_number_key" ON "Order"("tenantId", "branchId", "number");

-- Order já não tem nenhum UPDATE liberado a mash_app desde a migração
-- 20260904075346_add_quote_order (REVOKE UPDATE ON "Order" sem GRANT
-- nenhum depois) — "number" nasce automaticamente imutável, sem precisar
-- de um novo REVOKE aqui.
