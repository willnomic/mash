-- Unidade "vincular cliente à Quote": quem PEDIU a cotação.
--
-- Nota sobre o diff bruto do Prisma: duas linhas removidas por não
-- serem desta mudança — DROP INDEX "Order_customerReference_trgm_idx" e
-- CREATE UNIQUE INDEX "IbsCbsTaxSituation_tenantId_cst_cClassTrib_key"
-- são os mesmos falsos positivos já documentados nas migrações
-- 20260908060000, 20260910010000 e 20260911000000 (índices criados à
-- mão que o Prisma não reconhece pelo @@unique/índice nativo do
-- schema.prisma).

-- NOT NULL direto, sem backfill: zero Quote existente no banco de
-- desenvolvimento no momento desta unidade (confirmado antes de
-- modelar). Sem guarda de NULL (D-043): a coluna já nasce NOT NULL, não
-- existe caso NULL a considerar.
--
-- Mesmo tenant não é garantido por FK composta (Postgres não amarra FK
-- a chave composta nesta base) — mesmo precedente de Order.senderId/
-- recipientId/tomadorId e Quote.previousQuoteId: quem cria passa pelo
-- QuoteService, que só enxerga Party do próprio tenant via RLS (D-012),
-- então uma Party de outro tenant nunca é um partyId alcançável na
-- prática.
--
-- ON DELETE RESTRICT (não SET NULL, a coluna é NOT NULL; não CASCADE,
-- apagar o cliente não pode apagar o histórico de cotação, D-017) —
-- mesmo tratamento de Order.senderId/recipientId/tomadorId.
--
-- Sem GRANT UPDATE: fica no mesmo regime de icmsUf/marginPercentage
-- (nenhum dos dois tem GRANT) — gravável só no INSERT, nunca reescrito.
-- REVOKE UPDATE ON "Quote" já é geral desde a migração genesis
-- (20260904075346); colunas novas não ficam automaticamente
-- reescrevíveis, só as que recebem GRANT explícito. O cliente não muda
-- o preço, então não faz parte do congelamento de close().
ALTER TABLE "Quote" ADD COLUMN "partyId" UUID NOT NULL;

CREATE INDEX "Quote_tenantId_partyId_idx" ON "Quote"("tenantId", "partyId");

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
