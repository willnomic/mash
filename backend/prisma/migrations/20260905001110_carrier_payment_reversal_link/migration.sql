-- AlterTable
ALTER TABLE "CarrierPayment" ADD COLUMN     "reversesPaymentId" UUID;

-- AddForeignKey
ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "CarrierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- REVERSAL sempre aponta pro pagamento que desfaz; nenhum outro type
-- preenche essa coluna — garantido no banco, mesmo critério do
-- deductionReasonId↔DEDUCTION (migração 20260904173040).
ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_reversesPayment_required_iff_reversal"
  CHECK (("type" = 'REVERSAL') = ("reversesPaymentId" IS NOT NULL));

-- Impede estornar o mesmo pagamento duas vezes.
CREATE UNIQUE INDEX "CarrierPayment_reversesPaymentId_key"
  ON "CarrierPayment" ("reversesPaymentId") WHERE "reversesPaymentId" IS NOT NULL;

-- Retenção nunca é maior que o valor bruto.
ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_netAmount_lte_grossAmount"
  CHECK ("netAmount" IS NULL OR "netAmount" <= "grossAmount");
