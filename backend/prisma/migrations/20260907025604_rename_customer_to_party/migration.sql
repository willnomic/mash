-- Dívida de nomenclatura registrada na D-032: "Customer" representava
-- qualquer parte (cliente ou terceiro contratado via CarrierHire) sem o
-- nome dizer isso. RENAME, não DROP+ADD (mesmo critério da D-031) — não
-- há dado de produção ainda, mas é a forma correta: preserva a FK, o
-- RLS (ENABLE/FORCE/POLICY seguem o rename de tabela, ligados por oid,
-- não por nome) e o EXCLUDE USING gist da FreightRate (referencia a
-- coluna internamente por atributo — segue o RENAME COLUMN sem precisar
-- recriar a constraint).
ALTER TABLE "Customer" RENAME TO "Party";

ALTER TABLE "Party" RENAME CONSTRAINT "Customer_pkey" TO "Party_pkey";
ALTER TABLE "Party" RENAME CONSTRAINT "Customer_tenantId_fkey" TO "Party_tenantId_fkey";
ALTER TABLE "Party" RENAME CONSTRAINT "Customer_cpf_format" TO "Party_cpf_format";
ALTER TABLE "Party" RENAME CONSTRAINT "Customer_cnpj_format" TO "Party_cnpj_format";
ALTER TABLE "Party" RENAME CONSTRAINT "Customer_document_matches_person_type" TO "Party_document_matches_person_type";

ALTER INDEX "Customer_tenantId_active_idx" RENAME TO "Party_tenantId_active_idx";
ALTER INDEX "Customer_tenantId_cpf_key" RENAME TO "Party_tenantId_cpf_key";
ALTER INDEX "Customer_tenantId_cnpj_key" RENAME TO "Party_tenantId_cnpj_key";

-- Address: FK e coluna renomeadas — não é papel, é "a quem pertence este
-- endereço" (D-018).
ALTER TABLE "Address" RENAME COLUMN "customerId" TO "partyId";
ALTER TABLE "Address" RENAME CONSTRAINT "Address_customerId_fkey" TO "Address_partyId_fkey";
ALTER INDEX "Address_tenantId_customerId_idx" RENAME TO "Address_tenantId_partyId_idx";

-- FreightRate: idem.
ALTER TABLE "FreightRate" RENAME COLUMN "customerId" TO "partyId";
ALTER TABLE "FreightRate" RENAME CONSTRAINT "FreightRate_customerId_fkey" TO "FreightRate_partyId_fkey";
ALTER INDEX "FreightRate_tenantId_customerId_laneId_idx" RENAME TO "FreightRate_tenantId_partyId_laneId_idx";

-- Order (senderId/recipientId/tomadorId) e CarrierHire (thirdPartyId) não
-- mudam de coluna nem de nome de constraint — as FKs já apontam pro oid
-- da tabela, não pelo nome, então passam a referenciar "Party" sozinhas
-- assim que o RENAME TABLE acima roda.
