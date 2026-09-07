/*
  Warnings:

  - Changed the type of `result` on the `RiskClearance` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "RiskClearanceResult" AS ENUM ('RECOMENDADO', 'NAO_RECOMENDADO', 'INEXISTENTE', 'NAO_AUTORIZADO');

-- AlterTable
ALTER TABLE "RiskClearance" DROP COLUMN "result",
ADD COLUMN     "result" "RiskClearanceResult" NOT NULL;

-- Auditoria de modelo 08/09/2026: RiskClearance é evidência de
-- conformidade com a apólice (D-023) — "o não cumprimento faz perder o
-- direito à indenização". A migração original (add_trip) só revogava
-- DELETE por esse motivo; UPDATE ficou aberto por engano, herdado do
-- mesmo REVOKE DELETE que também cobria Trip (cujo comentário falava de
-- status/composição de veículo mudarem legitimamente ao longo da
-- viagem — raciocínio que nunca se aplicou a RiskClearance). Sem isso,
-- uma ficha "NAO_RECOMENDADO" podia virar "RECOMENDADO" depois do fato,
-- sem rastro. A ficha nasce completa (D-023: número, motorista, veículo,
-- proprietário, data, validade, resultado) — nenhuma coluna legitimamente
-- muda depois de criada. Revogação inteira, sem GRANT de coluna — mesmo
-- critério de CarrierPayment/PickupOrder (D-017).
REVOKE UPDATE ON "RiskClearance" FROM mash_app;
