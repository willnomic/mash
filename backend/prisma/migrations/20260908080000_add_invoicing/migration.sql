-- CreateEnum
CREATE TYPE "ReceivableEventType" AS ENUM ('PAYMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "AttachmentOwnerType" AS ENUM ('TRIP', 'BOLETO');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('PROOF_OF_DELIVERY', 'BOLETO_PDF');

-- AlterEnum
ALTER TYPE "BusinessDocumentType" ADD VALUE 'INVOICE';

-- NÃO derrubar "Order_customerReference_trgm_idx" (D-038) — o gerador de
-- diff do Prisma propõe isso sempre que uma migração nova mexe em
-- "Order" (mesma causa das duas vezes anteriores: não entende índice GIN
-- trigram criado via SQL cru). Removido de propósito.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "invoiceId" UUID;

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "invoicingPreference" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boleto" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "digitableLine" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Boleto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivableEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "type" "ReceivableEventType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reversesReceivableEventId" UUID,
    "paymentDate" DATE NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivableEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ownerType" "AttachmentOwnerType" NOT NULL,
    "ownerId" UUID NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_tenantId_branchId_idx" ON "Invoice"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_partyId_idx" ON "Invoice"("tenantId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_branchId_number_key" ON "Invoice"("tenantId", "branchId", "number");

-- CreateIndex
CREATE INDEX "Boleto_tenantId_invoiceId_idx" ON "Boleto"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "ReceivableEvent_tenantId_invoiceId_idx" ON "ReceivableEvent"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_ownerType_ownerId_idx" ON "Attachment"("tenantId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Order_tenantId_invoiceId_idx" ON "Order"("tenantId", "invoiceId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableEvent" ADD CONSTRAINT "ReceivableEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableEvent" ADD CONSTRAINT "ReceivableEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableEvent" ADD CONSTRAINT "ReceivableEvent_reversesReceivableEventId_fkey" FOREIGN KEY ("reversesReceivableEventId") REFERENCES "ReceivableEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- REVERSAL sempre aponta pro evento que desfaz; nenhum outro type
-- preenche essa coluna — mesmo critério exato de
-- CarrierPayment.reversesPaymentId (migração 20260905001110).
ALTER TABLE "ReceivableEvent" ADD CONSTRAINT "ReceivableEvent_reverses_required_iff_reversal"
  CHECK (("type" = 'REVERSAL') = ("reversesReceivableEventId" IS NOT NULL));

-- Impede estornar o mesmo evento duas vezes.
CREATE UNIQUE INDEX "ReceivableEvent_reversesReceivableEventId_key"
  ON "ReceivableEvent" ("reversesReceivableEventId") WHERE "reversesReceivableEventId" IS NOT NULL;

-- Valores sempre positivos — sinal/direção vem de type, nunca do número
-- (mesmo critério de CarrierPayment).
ALTER TABLE "ReceivableEvent" ADD CONSTRAINT "ReceivableEvent_amount_positive"
  CHECK ("amount" > 0);
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_amount_positive"
  CHECK ("amount" > 0);

-- Isolamento padrão (D-012) para as quatro tabelas novas — nenhuma é
-- catálogo compartilhado, todas são dado do tenant.
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Invoice"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "Boleto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Boleto" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Boleto"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "ReceivableEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReceivableEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReceivableEvent"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Attachment"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Imutabilidade (D-042). Invoice: nada nela muda legitimamente depois de
-- criada (quais Order pertencem a ela muda pelo lado de Order.invoiceId,
-- não daqui) — REVOKE por inteiro, sem GRANT de coluna nenhuma.
REVOKE UPDATE ON "Invoice" FROM mash_app;
REVOKE DELETE ON "Invoice" FROM mash_app;

-- Boleto: registro simples de algo que já aconteceu no banco, sem
-- rascunho — corrigir é linha nova (D-017), mesmo critério de
-- TollVoucherPurchase/PickupOrderItem.
REVOKE UPDATE ON "Boleto" FROM mash_app;
REVOKE DELETE ON "Boleto" FROM mash_app;

-- ReceivableEvent: livro append-only, mesmo critério de CarrierPayment —
-- nenhuma coluna legitimamente muda depois de criada, correção é
-- REVERSAL (linha nova).
REVOKE UPDATE ON "ReceivableEvent" FROM mash_app;
REVOKE DELETE ON "ReceivableEvent" FROM mash_app;

-- Attachment: append-only — anexo errado é linha nova (e, quando a
-- integração de storage real existir, objeto novo), nunca edição.
REVOKE UPDATE ON "Attachment" FROM mash_app;
REVOKE DELETE ON "Attachment" FROM mash_app;

-- Order ganha UPDATE liberado em invoiceId (D-042) — mesmo mecanismo de
-- coluna do statusId (D-038). number, valores congelados e as três Party
-- seguem fora do GRANT.
GRANT UPDATE ("invoiceId") ON "Order" TO mash_app;
