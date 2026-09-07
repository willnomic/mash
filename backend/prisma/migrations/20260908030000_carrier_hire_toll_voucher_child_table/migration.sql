/*
  Warnings:

  - You are about to drop the column `tollVoucherAmount` on the `CarrierHire` table. All the data in the column will be lost.
  - You are about to drop the column `tollVoucherPurchaseNumber` on the `CarrierHire` table. All the data in the column will be lost.
  - You are about to drop the column `tollVoucherSupplierCnpj` on the `CarrierHire` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CarrierHire" DROP COLUMN "tollVoucherAmount",
DROP COLUMN "tollVoucherPurchaseNumber",
DROP COLUMN "tollVoucherSupplierCnpj";

-- CreateTable
CREATE TABLE "TollVoucherPurchase" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "carrierHireId" UUID NOT NULL,
    "tollVoucherSupplierCnpj" VARCHAR(14),
    "tollVoucherPurchaseNumber" TEXT,
    "tollVoucherAmount" DECIMAL(14,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TollVoucherPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TollVoucherPurchase_tenantId_carrierHireId_idx" ON "TollVoucherPurchase"("tenantId", "carrierHireId");

-- AddForeignKey
ALTER TABLE "TollVoucherPurchase" ADD CONSTRAINT "TollVoucherPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TollVoucherPurchase" ADD CONSTRAINT "TollVoucherPurchase_carrierHireId_fkey" FOREIGN KEY ("carrierHireId") REFERENCES "CarrierHire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Formato de CNPJ (contagem de dígitos, não dígito verificador — seção
-- 1.6) e valor positivo — carregados de CarrierHire, mesmos CHECKs de
-- antes (add_carrier_hire_and_payment), só movidos pra cá junto das
-- colunas.
ALTER TABLE "TollVoucherPurchase" ADD CONSTRAINT "TollVoucherPurchase_supplierCnpj_format"
  CHECK ("tollVoucherSupplierCnpj" IS NULL OR "tollVoucherSupplierCnpj" ~ '^[0-9]{14}$');

ALTER TABLE "TollVoucherPurchase" ADD CONSTRAINT "TollVoucherPurchase_amount_positive"
  CHECK ("tollVoucherAmount" IS NULL OR "tollVoucherAmount" > 0);

-- Isolamento padrão (D-012).
ALTER TABLE "TollVoucherPurchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TollVoucherPurchase" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TollVoucherPurchase"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Auditoria de modelo 08/09/2026 (D-036): livro append-only, mesmo
-- critério de CarrierPayment/PickupOrder (D-017) — era mutável sem
-- histórico como três colunas em CarrierHire, e ia alimentar o MDF-e
-- (documento fiscal é append-only, D-014). Correção agora é linha nova,
-- nunca edição. Revogação inteira, sem GRANT de coluna.
REVOKE UPDATE ON "TollVoucherPurchase" FROM mash_app;
REVOKE DELETE ON "TollVoucherPurchase" FROM mash_app;
