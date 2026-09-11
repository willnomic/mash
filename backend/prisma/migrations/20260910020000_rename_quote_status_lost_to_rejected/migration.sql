-- Emenda de nomenclatura, decorrente da unidade "ciclo de vida da Quote"
-- (migração anterior, 20260910010000_add_quote_lifecycle): o método de
-- recusa virou QuoteService.reject(), mas o status continuava
-- LOST/"Perdida" — descasado do nome do método e do motivo real do
-- desfecho. Fixado nesta sessão: LOST/REJECTED significa "o cliente
-- respondeu não à proposta". O caso "o cliente sumiu" NÃO é esse status
-- — é derivado (CLOSED, sem desfecho, validUntil vencido), nunca
-- gravado como linha própria (ver comentário em QuoteStatus no
-- schema.prisma). Com "sumiu" fora do escopo do status, "Recusada"
-- descreve o que sobrou melhor que "Perdida", e fica simétrico com
-- "Aceita".
--
-- UPDATE na linha semeada em 20260904075346_add_quote_order, não INSERT
-- nova: o id é a chave que Quote.statusId referencia (FK), code/name
-- são só rótulo — trocar os dois não move nenhuma FK nem exige
-- backfill. Confirmado antes desta migração: nenhuma outra migração,
-- CHECK ou FK depende do literal 'LOST'.
UPDATE "QuoteStatus"
SET code = 'REJECTED', name = 'Recusada', "updatedAt" = now()
WHERE id = '00000000-0000-7000-8000-000000000003'
  AND "tenantId" IS NULL
  AND code = 'LOST';
