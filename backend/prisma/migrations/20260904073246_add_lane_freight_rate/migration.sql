-- CreateTable
CREATE TABLE "Lane" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "originCity" TEXT NOT NULL,
    "originState" CHAR(2) NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "destinationState" CHAR(2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightRate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "laneId" UUID NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "minimumFreight" DECIMAL(14,2) NOT NULL,
    "additionalPercentage" DECIMAL(7,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FreightRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lane_tenantId_idx" ON "Lane"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Lane_tenantId_originCity_originState_destinationCity_destin_key" ON "Lane"("tenantId", "originCity", "originState", "destinationCity", "destinationState");

-- CreateIndex
CREATE INDEX "FreightRate_tenantId_customerId_laneId_idx" ON "FreightRate"("tenantId", "customerId", "laneId");

-- AddForeignKey
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightRate" ADD CONSTRAINT "FreightRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightRate" ADD CONSTRAINT "FreightRate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightRate" ADD CONSTRAINT "FreightRate_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Isolamento (D-012), mesmo padrão das demais tabelas.
ALTER TABLE "Lane" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lane" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Lane"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "FreightRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FreightRate" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "FreightRate"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Sobreposição de vigência (D-014): duas linhas de FreightRate não podem
-- valer ao mesmo tempo para o mesmo tenant+customer+lane. btree_gist é
-- exigido porque o índice GiST precisa comparar igualdade (uuid) junto
-- com sobreposição de intervalo (daterange) na mesma constraint.
-- Verificado nesta sessão: mash_owner é superuser no Postgres local
-- (docker-compose); NÃO verificado se a plataforma gerenciada de produção
-- (Railway/Render, D-005) permite CREATE EXTENSION sem superuser — checar
-- antes do primeiro deploy.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "FreightRate" ADD CONSTRAINT "FreightRate_no_overlapping_validity"
  EXCLUDE USING gist (
    "tenantId"   WITH =,
    "customerId" WITH =,
    "laneId"     WITH =,
    daterange("validFrom", "validTo", '[)') WITH &&
  );

-- Imutabilidade (D-014, corrigida 04/09/2026): o GRANT geral de
-- ALTER DEFAULT PRIVILEGES (primeira migração) dá UPDATE na tabela
-- inteira por padrão — revogado aqui e substituído por UPDATE só nas
-- colunas de fechamento. Tarifa, valor e a identidade da linha nunca
-- podem ser alteradas depois de criadas; só "fechar a vigência"
-- (validTo) é uma operação permitida.
REVOKE UPDATE ON "FreightRate" FROM mash_app;
GRANT UPDATE ("validTo", "updatedAt") ON "FreightRate" TO mash_app;
