-- Unidade "lista de cotações".
--
-- Nota sobre o diff bruto do Prisma: duas linhas removidas por não
-- serem desta mudança — DROP INDEX "Order_customerReference_trgm_idx" e
-- CREATE UNIQUE INDEX "IbsCbsTaxSituation_tenantId_cst_cClassTrib_key"
-- são os mesmos falsos positivos já documentados nas migrações
-- 20260908060000, 20260910010000, 20260911000000 e 20260911020000
-- (índices/constraints criados à mão que o Prisma não reconhece pelo
-- @@unique/índice nativo do schema.prisma).

-- Visão padrão da lista (fechada e válida, ordenada por validade mais
-- próxima) filtra por tenantId+statusId e ordena por validUntil — este
-- índice composto cobre filtro e ordenação juntos.
CREATE INDEX "Quote_tenantId_statusId_validUntil_idx" ON "Quote"("tenantId", "statusId", "validUntil");

-- Busca por nome do cliente (unidade "lista de cotações") — mesmo
-- padrão exato da D-038 (Order.customerReference): pg_trgm já
-- habilitado desde 20260908050000, não recriado aqui. Índice GIN
-- trigram não é uma feature que o schema.prisma consegue expressar
-- nativamente (mesmo motivo do índice do customerReference nunca
-- aparecer lá) — criado só na migração, invisível ao diff do Prisma.
-- Evidência do padrão: ILIKE '%...%' (Prisma: contains + mode:
-- insensitive) cai pra sequential scan sem isto.
CREATE INDEX "Party_name_trgm_idx"
  ON "Party" USING GIN ("name" gin_trgm_ops);
