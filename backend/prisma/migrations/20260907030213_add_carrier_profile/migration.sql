-- CreateEnum
CREATE TYPE "AnttCategory" AS ENUM ('TAC', 'ETC', 'CTC');

-- CreateEnum
CREATE TYPE "CarrierBondType" AS ENUM ('SPOT', 'AGREGADO');

-- CreateTable
CREATE TABLE "CarrierProfile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "rntrc" TEXT NOT NULL,
    "anttCategory" "AnttCategory" NOT NULL,
    "bondType" "CarrierBondType" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CarrierProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarrierProfile_partyId_key" ON "CarrierProfile"("partyId");

-- CreateIndex
CREATE INDEX "CarrierProfile_tenantId_idx" ON "CarrierProfile"("tenantId");

-- AddForeignKey
ALTER TABLE "CarrierProfile" ADD CONSTRAINT "CarrierProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierProfile" ADD CONSTRAINT "CarrierProfile_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Isolamento (D-012), mesmo padrão das demais tabelas.
ALTER TABLE "CarrierProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarrierProfile" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "CarrierProfile"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Sem GRANT explícito: ALTER DEFAULT PRIVILEGES da primeira migração
-- (mesmo role mash_owner) já cobre tabela nova.
