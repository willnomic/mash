-- CreateTable
CREATE TABLE "QuoteStatus" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuoteStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "freightRateId" UUID NOT NULL,
    "statusId" UUID NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "minimumFreight" DECIMAL(14,2) NOT NULL,
    "additionalPercentage" DECIMAL(7,4) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "quoteId" UUID,
    "freightRateId" UUID NOT NULL,
    "remetenteId" UUID NOT NULL,
    "destinatarioId" UUID NOT NULL,
    "tomadorId" UUID NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "minimumFreight" DECIMAL(14,2) NOT NULL,
    "additionalPercentage" DECIMAL(7,4) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteStatus_tenantId_code_key" ON "QuoteStatus"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Quote_tenantId_statusId_idx" ON "Quote"("tenantId", "statusId");

-- CreateIndex
CREATE INDEX "Order_tenantId_branchId_idx" ON "Order"("tenantId", "branchId");

-- AddForeignKey
ALTER TABLE "QuoteStatus" ADD CONSTRAINT "QuoteStatus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_freightRateId_fkey" FOREIGN KEY ("freightRateId") REFERENCES "FreightRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "QuoteStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_freightRateId_fkey" FOREIGN KEY ("freightRateId") REFERENCES "FreightRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_remetenteId_fkey" FOREIGN KEY ("remetenteId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tomadorId_fkey" FOREIGN KEY ("tomadorId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- QuoteStatus (D-020): tenantId nulo = padrão do sistema, visível e
-- (deliberadamente, ver comentário no schema.prisma) gravável por
-- qualquer tenant. Não é a política padrão de isolamento — aqui leitura E
-- escrita liberam tenantId IS NULL, porque é catálogo compartilhado, não
-- dado isolado.
ALTER TABLE "QuoteStatus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuoteStatus" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "QuoteStatus"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  );

-- Só um status padrão por código (a unicidade tenantId+code do Prisma não
-- protege NULL: Postgres trata cada NULL como distinto num índice único
-- comum). Índice parcial cobre exatamente o caso das linhas globais.
CREATE UNIQUE INDEX "QuoteStatus_code_system_default_key"
  ON "QuoteStatus" (code) WHERE "tenantId" IS NULL;

-- Semente dos três status padrão (D-020: "tenantId nulo = padrão do
-- sistema"). IDs literais, não gerados — não é o caminho de criação da
-- aplicação (D-015), é dado de referência escrito uma vez, aqui.
INSERT INTO "QuoteStatus" (id, "tenantId", code, name, "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000001', NULL, 'OPEN',   'Aberta',  now(), now()),
  ('00000000-0000-7000-8000-000000000002', NULL, 'CLOSED', 'Fechada', now(), now()),
  ('00000000-0000-7000-8000-000000000003', NULL, 'LOST',   'Perdida', now(), now());

-- Isolamento padrão (D-012) para Quote e Order.
ALTER TABLE "Quote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Quote" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Quote"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Order"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Imutabilidade (D-014, mesmo mecanismo do FreightRate): tarifa, valor e
-- identidade da linha nunca mudam depois de criadas. Quote pode mudar de
-- status (aberta -> fechada/perdida); Order não tem nenhuma coluna que
-- legitimamente mude depois de criada — por isso não sobra UPDATE nenhum
-- pra ela.
REVOKE UPDATE ON "Quote" FROM mash_app;
GRANT UPDATE ("statusId", "updatedAt") ON "Quote" TO mash_app;

REVOKE UPDATE ON "Order" FROM mash_app;

-- DELETE revogado nas duas (D-017: movimento/histórico financeiro nunca
-- se apaga — "perdida" existe justamente pra registrar o desfecho de uma
-- Quote sem apagar a linha).
REVOKE DELETE ON "Quote" FROM mash_app;
REVOKE DELETE ON "Order" FROM mash_app;
