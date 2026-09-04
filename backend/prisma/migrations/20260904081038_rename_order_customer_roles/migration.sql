-- Correção de nomenclatura (D-007): "remetente"/"destinatário" traduzem
-- sem perda para sender/recipient — só "tomador" carrega definição
-- fiscal (destaque de ICMS, destino da fatura, D-018) que a tradução
-- destruiria. Detalhe em docs/decisoes.md.
--
-- RENAME, não DROP+ADD: não há dado de produção ainda, mas é a forma
-- correta de renomear coluna sem perder dado nem recriar a FK à toa.
ALTER TABLE "Order" RENAME COLUMN "remetenteId" TO "senderId";
ALTER TABLE "Order" RENAME COLUMN "destinatarioId" TO "recipientId";

ALTER TABLE "Order" RENAME CONSTRAINT "Order_remetenteId_fkey" TO "Order_senderId_fkey";
ALTER TABLE "Order" RENAME CONSTRAINT "Order_destinatarioId_fkey" TO "Order_recipientId_fkey";
