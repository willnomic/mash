-- Ciclo de vida da Quote: status de desfecho, validade e revisão.
--
-- Confirmado antes desta migração (não duplicado): QuoteStatus já tinha
-- OPEN/CLOSED/LOST (migração 20260904075346_add_quote_order). LOST/
-- "Perdida" é reaproveitado como a recusa explícita do cliente
-- (QuoteService.reject(), renomeado de markLost() — sem chamador
-- externo até aqui, renomear não quebra nada) — nenhum status novo pra
-- recusa. Só ACCEPTED/"Aceita" é semeado aqui. EXPIRADA continua sem
-- ser status: é derivada (CLOSED, sem desfecho, validUntil já
-- passado) — ver comentário completo em QuoteStatus no schema.prisma.
--
-- Nota sobre o diff bruto do Prisma: duas linhas que o gerador propôs
-- foram removidas por não serem desta mudança — DROP INDEX
-- "Order_customerReference_trgm_idx" (mesmo falso positivo já
-- documentado na migração 20260908060000: índice GIN trigram criado
-- via SQL cru, sem representação nativa no schema.prisma) e CREATE
-- UNIQUE INDEX "IbsCbsTaxSituation_tenantId_cst_cClassTrib_key" (mesmo
-- padrão: o índice real em produção é o parcial
-- "IbsCbsTaxSituation_cst_cClassTrib_system_default_key", da migração
-- 20260909000000 — drift pré-existente entre o nome que o Prisma espera
-- pelo @@unique do schema e o índice parcial que a mão escreveu, não
-- uma diferença introduzida aqui).

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "previousQuoteId" UUID,
ADD COLUMN     "validUntil" DATE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_previousQuoteId_fkey" FOREIGN KEY ("previousQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Impede autorreferência — revisão/recotação de si mesma não faz
-- sentido. Guarda de NULL explícita (mesma disciplina da D-043/D-045):
-- previousQuoteId nulo passa livre, só compara quando preenchido.
-- "Mesmo tenant" NÃO é garantido aqui (Postgres não amarra FK a chave
-- composta sem um índice único (tenantId, id) dedicado, e isso não foi
-- pedido) — mesmo critério já aceito em
-- CarrierPayment.reversesPaymentId/ReceivableEvent.
-- reversesReceivableEventId: quem cria passa pelo QuoteService, que só
-- enxerga Quote do próprio tenant via RLS (D-012), então uma Quote de
-- outro tenant nunca é alcançável como previousQuoteId na prática, só
-- não há uma segunda trava no banco contra quem grava direto.
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_previousQuoteId_not_self" CHECK (
  "previousQuoteId" IS NULL OR "previousQuoteId" <> "id"
);

-- Novo UPDATE liberado em Quote (D-014, mesmo mecanismo de
-- icmsRateApplied/ibsRateApplied/cbsRateApplied/total — migração
-- 20260908060000): validUntil é congelada no FECHAMENTO
-- (QuoteService.close()), não na criação, então precisa do GRANT.
-- previousQuoteId fica fora: só se preenche no INSERT (é escolha de
-- quem cria a revisão/recotação), nunca muda depois — mesmo critério
-- de freightRateId/marginPercentage/icmsUf.
GRANT UPDATE ("validUntil") ON "Quote" TO mash_app;

-- Semente: só o status que faltava (ver nota acima) — código em inglês
-- (D-007), name em português pra tela (D-008).
INSERT INTO "QuoteStatus" (id, "tenantId", code, name, "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000091', NULL, 'ACCEPTED', 'Aceita', now(), now());
