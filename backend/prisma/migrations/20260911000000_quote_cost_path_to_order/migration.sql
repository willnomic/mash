-- Unidade "caminho CUSTO → Order": o aceite da cotação cria o pedido.
--
-- Nota sobre o diff bruto do Prisma: duas linhas removidas por não
-- serem desta mudança — DROP INDEX "Order_customerReference_trgm_idx"
-- e CREATE UNIQUE INDEX "IbsCbsTaxSituation_tenantId_cst_cClassTrib_key"
-- são os mesmos falsos positivos já documentados nas migrações
-- 20260908060000 e 20260910010000 (índices criados à mão que o Prisma
-- não reconhece pelo @@unique/índice nativo do schema.prisma).

-- Quantidade de viagens cotadas (evidência: e-mail cotando 4 contêineres
-- com lacre individual; planilha com um processo de 5 caminhões, CT-e
-- 7581-7585). DEFAULT 1 — toda Quote existente (e o caminho TABELA, que
-- nunca informa isso) continua válida sem backfill.
ALTER TABLE "Quote" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- Sem guarda de NULL: a coluna é NOT NULL, não existe caso NULL a
-- considerar (diferente dos CHECK de D-043/D-045, todos sobre coluna
-- anulável).
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_quantity_positive" CHECK ("quantity" > 0);

-- Congelada no FECHAMENTO, mesmo mecanismo de GRANT de coluna que já
-- cobre validUntil (20260910010000) — close() passa a aceitar quantity
-- junto do prazo de validade.
GRANT UPDATE ("quantity") ON "Quote" TO mash_app;

-- Order ganha o mesmo tratamento dual-path que a D-041 deu a Quote:
-- caminho TABELA (freightRateId+rate/minimumFreight/additionalPercentage,
-- comportamento inalterado) ou caminho CUSTO (os quatro nulos — a Quote
-- de origem não tem FreightRate, D-041). total continua NOT NULL nos
-- dois: é conhecido no INSERT em ambos (TABELA sempre foi; CUSTO só cria
-- o Order depois de fechada, quando Quote.total já existe).
ALTER TABLE "Order" DROP CONSTRAINT "Order_freightRateId_fkey";
ALTER TABLE "Order" ALTER COLUMN "freightRateId" DROP NOT NULL,
ALTER COLUMN "rate" DROP NOT NULL,
ALTER COLUMN "minimumFreight" DROP NOT NULL,
ALTER COLUMN "additionalPercentage" DROP NOT NULL;
ALTER TABLE "Order" ADD CONSTRAINT "Order_freightRateId_fkey" FOREIGN KEY ("freightRateId") REFERENCES "FreightRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_pricing_path_exclusive" CHECK (
  (
    "freightRateId" IS NOT NULL
    AND "rate" IS NOT NULL
    AND "minimumFreight" IS NOT NULL
    AND "additionalPercentage" IS NOT NULL
  )
  OR
  (
    "freightRateId" IS NULL
    AND "rate" IS NULL
    AND "minimumFreight" IS NULL
    AND "additionalPercentage" IS NULL
  )
);

-- Uma Quote produz no máximo um Order — o banco garante (diferente das
-- três regras de data/status da D-046, que o CHECK não enxerga). NULL
-- não colide: Postgres trata cada NULL como distinto num índice único
-- comum, então N Order do caminho createFromFreightRate (quoteId
-- sempre nulo) continuam livres — mesma armadilha de NULL de sempre,
-- só que aqui ela trabalha a nosso favor, não precisa de índice parcial.
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");

-- Trip: motorista, veículo e destino nulos são deliberados (não lacuna)
-- — preenchidos NA OPERAÇÃO, não na cotação. Quote não carrega rota
-- nenhuma no caminho CUSTO (nem Lane, nem Address — icmsUf é só a UF do
-- ICMS, D-041), então destinationAddressId entra na mesma decisão por
-- simetria, mesmo não citado explicitamente no pedido desta unidade.
-- Sem GRANT novo: Trip nunca teve REVOKE de UPDATE (só DELETE, já
-- existente), então atribuir os três mais tarde (TripService futuro)
-- já funciona com o privilégio default.
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_destinationAddressId_fkey";
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_driverId_fkey";
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_vehicleId_fkey";
ALTER TABLE "Trip" ALTER COLUMN "destinationAddressId" DROP NOT NULL,
ALTER COLUMN "driverId" DROP NOT NULL,
ALTER COLUMN "vehicleId" DROP NOT NULL;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destinationAddressId_fkey" FOREIGN KEY ("destinationAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preço unitário da viagem (D-013, mesma escala de Order.total) —
-- copiado de Quote.total na criação (accept()), nunca recalculado
-- depois. Anulável: corrigido nesta mesma sessão depois que a versão
-- NOT NULL quebrou ~20 arquivos de teste pré-existentes que criam Trip
-- direto (RLS, sequence, status, PickupOrder...) sem nenhum contexto de
-- cotação — "preço" não é atributo universal de Trip, só das que nascem
-- de QuoteService.accept().
ALTER TABLE "Trip" ADD COLUMN "price" DECIMAL(14,2);
