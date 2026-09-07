/*
  Warnings:

  - Made the column `netAmount` on table `CarrierPayment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "CarrierPayment" ALTER COLUMN "netAmount" SET NOT NULL;

-- Auditoria de modelo 08/09/2026: netAmount opcional deixava o CHECK
-- "netAmount <= grossAmount" sem efeito em linha sem retenção — Postgres
-- aprova CHECK quando a comparação avalia NULL — e um SUM(netAmount)
-- excluiria essas linhas em silêncio, subestimando o valor líquido pago.
-- Recria o CHECK sem a cláusula "IS NULL OR", redundante agora que a
-- coluna é NOT NULL.
ALTER TABLE "CarrierPayment" DROP CONSTRAINT "CarrierPayment_netAmount_positive";
ALTER TABLE "CarrierPayment" ADD CONSTRAINT "CarrierPayment_netAmount_positive"
  CHECK ("netAmount" > 0);
