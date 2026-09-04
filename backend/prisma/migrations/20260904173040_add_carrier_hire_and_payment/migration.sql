-- CreateEnum
CREATE TYPE "PaymentEventType" AS ENUM ('ADVANCE', 'BALANCE', 'DEDUCTION', 'REVERSAL');

-- CreateTable
CREATE TABLE "DeductionReason" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeductionReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierHire" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "thirdPartyId" UUID NOT NULL,
    "agreedFreight" DECIMAL(14,2) NOT NULL,
    "ciotNumber" TEXT,
    "tollVoucherSupplierCnpj" VARCHAR(14),
    "tollVoucherPurchaseNumber" TEXT,
    "tollVoucherAmount" DECIMAL(14,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CarrierHire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierPayment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "carrierHireId" UUID NOT NULL,
    "type" "PaymentEventType" NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "netAmount" DECIMAL(14,2),
    "deductionReasonId" UUID,
    "paymentDate" DATE NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarrierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeductionReason_tenantId_code_key" ON "DeductionReason"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierHire_tripId_key" ON "CarrierHire"("tripId");

-- CreateIndex
CREATE INDEX "CarrierHire_tenantId_branchId_idx" ON "CarrierHire"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "CarrierPayment_tenantId_carrierHireId_idx" ON "CarrierPayment"("tenantId", "carrierHireId");

-- AddForeignKey
ALTER TABLE "DeductionReason" ADD CONSTRAINT "DeductionReason_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierHire" ADD CONSTRAINT "CarrierHire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierHire" ADD CONSTRAINT "CarrierHire_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierHire" ADD CONSTRAINT "CarrierHire_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierHire" ADD CONSTRAINT "CarrierHire_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_carrierHireId_fkey" FOREIGN KEY ("carrierHireId") REFERENCES "CarrierHire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_deductionReasonId_fkey" FOREIGN KEY ("deductionReasonId") REFERENCES "DeductionReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Formato de CNPJ (contagem de dígitos, não dígito verificador — seção
-- 1.6), mesmo critério do Customer.
ALTER TABLE "CarrierHire" ADD CONSTRAINT "CarrierHire_tollVoucherSupplierCnpj_format"
  CHECK ("tollVoucherSupplierCnpj" IS NULL OR "tollVoucherSupplierCnpj" ~ '^[0-9]{14}$');

ALTER TABLE "CarrierHire" ADD CONSTRAINT "CarrierHire_agreedFreight_positive"
  CHECK ("agreedFreight" > 0);

ALTER TABLE "CarrierHire" ADD CONSTRAINT "CarrierHire_tollVoucherAmount_positive"
  CHECK ("tollVoucherAmount" IS NULL OR "tollVoucherAmount" > 0);

-- Valores sempre positivos: o sinal/direção do evento vem de "type",
-- nunca do número (mesmo critério de "banco garante" do D-012/D-014).
ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_grossAmount_positive"
  CHECK ("grossAmount" > 0);

ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_netAmount_positive"
  CHECK ("netAmount" IS NULL OR "netAmount" > 0);

-- Motivo de desconto obrigatório exatamente quando type = DEDUCTION —
-- garantido no banco, não por disciplina da aplicação.
ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_deductionReason_required_iff_deduction"
  CHECK (("type" = 'DEDUCTION') = ("deductionReasonId" IS NOT NULL));

-- DeductionReason (D-020): mesmo padrão de QuoteStatus — tenantId nulo =
-- padrão do sistema, catálogo compartilhado (não dado isolado), leitura
-- E escrita liberam tenantId IS NULL.
ALTER TABLE "DeductionReason" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeductionReason" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "DeductionReason"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  );

-- Só um motivo padrão por código (Postgres trata cada NULL como
-- distinto num índice único comum — mesmo problema e mesma solução do
-- QuoteStatus).
CREATE UNIQUE INDEX "DeductionReason_code_system_default_key"
  ON "DeductionReason" (code) WHERE "tenantId" IS NULL;

-- Semente dos motivos citados (D-026: avaria, diária, multa,
-- abastecimento descontado do frete). IDs literais, dado de referência
-- escrito uma vez, não pelo caminho de criação da aplicação (D-015).
INSERT INTO "DeductionReason" (id, "tenantId", code, name, "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000101', NULL, 'DAMAGE',    'Avaria',        now(), now()),
  ('00000000-0000-7000-8000-000000000102', NULL, 'DETENTION', 'Diária',        now(), now()),
  ('00000000-0000-7000-8000-000000000103', NULL, 'FINE',      'Multa',         now(), now()),
  ('00000000-0000-7000-8000-000000000104', NULL, 'FUEL',      'Abastecimento', now(), now());

-- Isolamento padrão (D-012) para CarrierHire e CarrierPayment.
ALTER TABLE "CarrierHire" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarrierHire" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "CarrierHire"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "CarrierPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarrierPayment" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "CarrierPayment"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Imutabilidade (D-014): tripId/thirdPartyId/agreedFreight congelam.
-- CIOT e vale-pedágio são preenchidos depois da contratação (emitidos
-- fora do sistema, antes da viagem sair) — únicas colunas com UPDATE
-- liberado, mesmo mecanismo do Quote (GRANT por coluna).
REVOKE UPDATE ON "CarrierHire" FROM mash_app;
GRANT UPDATE ("ciotNumber", "tollVoucherSupplierCnpj", "tollVoucherPurchaseNumber", "tollVoucherAmount", "updatedAt")
  ON "CarrierHire" TO mash_app;

REVOKE DELETE ON "CarrierHire" FROM mash_app;

-- CarrierPayment é livro append-only (D-017/D-019): nenhuma coluna
-- legitimamente muda depois de criada — correção é estorno (REVERSAL),
-- linha nova, nunca edição da original. Revogação inteira, não GRANT de
-- coluna: diferente de CarrierHire/FreightRate/Quote, aqui não sobra
-- nenhuma coluna mutável.
REVOKE UPDATE ON "CarrierPayment" FROM mash_app;
REVOKE DELETE ON "CarrierPayment" FROM mash_app;
