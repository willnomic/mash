-- NÃO derrubar "Order_customerReference_trgm_idx" (D-038) — o gerador de
-- diff do Prisma propôs isso de novo (mesma causa da migração anterior:
-- não entende índice GIN trigram criado via SQL cru). Removido de
-- propósito.

-- AlterTable
ALTER TABLE "TaxRate" ADD COLUMN     "isPlaceholder" BOOLEAN NOT NULL DEFAULT false;

-- Marca as 27 linhas de ICMS semeadas na migração anterior
-- (20260908060000_add_quote_pricing) como placeholder — foram inseridas
-- com um valor uniforme (18%) só pra tabela nascer populada, nunca
-- pesquisadas por estado (D-041). IBS/CBS não entram aqui: são dado real
-- do usuário (LC 214/2025), `isPlaceholder` já nasce `false` (default da
-- coluna).
UPDATE "TaxRate" SET "isPlaceholder" = true WHERE "taxType" = 'ICMS';
