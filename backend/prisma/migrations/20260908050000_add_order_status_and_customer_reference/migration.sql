-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerReference" TEXT,
ADD COLUMN     "statusId" UUID NOT NULL;

-- CreateTable
CREATE TABLE "OrderStatus" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderStatus_tenantId_code_key" ON "OrderStatus"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Order_tenantId_statusId_idx" ON "Order"("tenantId", "statusId");

-- AddForeignKey
ALTER TABLE "OrderStatus" ADD CONSTRAINT "OrderStatus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "OrderStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OrderStatus (D-020 + achado nº 4 da auditoria de modelo, D-036): mesmo
-- padrão do QuoteStatus — tenantId nulo = padrão do sistema, catálogo
-- compartilhado (leitura E escrita liberam tenantId IS NULL), não
-- isolamento padrão.
ALTER TABLE "OrderStatus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderStatus" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "OrderStatus"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  );

-- Só um status padrão por código (mesmo problema do QuoteStatus/
-- TripStatus: a unicidade tenantId+code do Prisma não protege NULL —
-- Postgres trata cada NULL como distinto num índice único comum).
CREATE UNIQUE INDEX "OrderStatus_code_system_default_key"
  ON "OrderStatus" (code) WHERE "tenantId" IS NULL;

-- Semente: só os três status que a planilha real comprova em uso
-- (coluna STATUS: FINALIZADO/ANDAMENTO/CANCELADO, com linhas canceladas
-- de verdade) — não a taxonomia completa. Código em inglês (D-007: é
-- vocabulário interno, name já carrega o rótulo em português, D-008).
INSERT INTO "OrderStatus" (id, "tenantId", code, name, "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000021', NULL, 'IN_PROGRESS', 'Em andamento', now(), now()),
  ('00000000-0000-7000-8000-000000000022', NULL, 'COMPLETED',   'Finalizado',   now(), now()),
  ('00000000-0000-7000-8000-000000000023', NULL, 'CANCELLED',   'Cancelado',    now(), now());

-- Imutabilidade (D-014, achado nº 4 da auditoria D-036): até aqui Order
-- não tinha NENHUM UPDATE liberado (migração 20260904075346). status é a
-- primeira coluna que legitimamente muda depois da criação — libera só
-- ela + updatedAt, mesmo mecanismo de coluna do Quote/FreightRate.
-- number, valores congelados e as três Party seguem fora do alcance:
-- cancelar não reabre o número de negócio pra reuso (D-015) porque
-- DocumentCounter não tem nenhum caminho que reaja a mudança de status,
-- e "number" nunca entra neste GRANT.
GRANT UPDATE ("statusId", "updatedAt") ON "Order" TO mash_app;

-- Busca por customerReference (D-038): evidência de campo mostra
-- formatos livres por cliente, sem prefixo comum ("PRA 7497/24",
-- "001-OP-I-6403", "32584/25-IMA") — o operador digita um pedaço do
-- número, não necessariamente do começo. Um índice btree comum só ajuda
-- em igualdade/prefixo (LIKE 'foo%'); "contém" (LIKE '%foo%') cai pra
-- sequential scan. GIN trigram (pg_trgm) acelera ILIKE '%...%' de
-- verdade. Mesma categoria de risco de plataforma gerenciada que o
-- btree_gist do FreightRate (D-014) — não verificado se Railway/Render
-- permite CREATE EXTENSION sem superuser, checar antes do deploy
-- (docs/deploy-checklist.md).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Order_customerReference_trgm_idx"
  ON "Order" USING GIN ("customerReference" gin_trgm_ops);
