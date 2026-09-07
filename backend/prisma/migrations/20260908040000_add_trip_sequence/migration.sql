-- Ordem da perna dentro do pedido (transbordo, D-018/estado.md): sócio
-- confirmou em campo que ~1 em 8 viagens tem armazenagem ou crossdocking
-- intermediário antes do destino final — não é raridade a ignorar.
-- Sem linha existente (tabela vazia nesta sessão) — NOT NULL direto, sem
-- precisar de default nem backfill, mesmo critério do Order.number
-- (20260908000000_add_document_counter_order_number).
ALTER TABLE "Trip" ADD COLUMN "sequence" INTEGER NOT NULL;

-- Único dentro do Order. Deliberadamente SEM contiguidade exigida: perna
-- cancelada pode deixar buraco, sem consequência legal como há na
-- numeração de CT-e (D-015) — por isso nenhuma tabela contadora aqui,
-- só um inteiro atribuído pela aplicação.
CREATE UNIQUE INDEX "Trip_orderId_sequence_key" ON "Trip"("orderId", "sequence");
