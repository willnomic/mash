-- CreateTable
CREATE TABLE "TripStatus" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TripStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskClearance" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "driverId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "ownerName" TEXT NOT NULL,
    "checkDate" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RiskClearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "destinationAddressId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "trailer1Id" UUID,
    "trailer2Id" UUID,
    "riskClearanceId" UUID,
    "statusId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripStatus_tenantId_code_key" ON "TripStatus"("tenantId", "code");

-- CreateIndex
CREATE INDEX "RiskClearance_tenantId_driverId_vehicleId_idx" ON "RiskClearance"("tenantId", "driverId", "vehicleId");

-- CreateIndex
CREATE INDEX "Trip_tenantId_branchId_idx" ON "Trip"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Trip_tenantId_orderId_idx" ON "Trip"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "Trip_tenantId_statusId_idx" ON "Trip"("tenantId", "statusId");

-- AddForeignKey
ALTER TABLE "TripStatus" ADD CONSTRAINT "TripStatus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskClearance" ADD CONSTRAINT "RiskClearance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskClearance" ADD CONSTRAINT "RiskClearance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskClearance" ADD CONSTRAINT "RiskClearance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destinationAddressId_fkey" FOREIGN KEY ("destinationAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_trailer1Id_fkey" FOREIGN KEY ("trailer1Id") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_trailer2Id_fkey" FOREIGN KEY ("trailer2Id") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_riskClearanceId_fkey" FOREIGN KEY ("riskClearanceId") REFERENCES "RiskClearance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "TripStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composição de veículo: sanidade estrutural simples (não regra de
-- negócio) — sem trailer2 sem trailer1, e nenhum veículo repetido na
-- mesma viagem. Cruzar com Vehicle.type (ex.: "trailer só faz sentido com
-- cavalo mecânico") fica pra aplicação (D-030).
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_trailer2_requires_trailer1"
  CHECK ("trailer2Id" IS NULL OR "trailer1Id" IS NOT NULL);
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicles_are_distinct"
  CHECK (
    "vehicleId" <> "trailer1Id"
    AND "vehicleId" <> "trailer2Id"
    AND ("trailer1Id" IS NULL OR "trailer2Id" IS NULL OR "trailer1Id" <> "trailer2Id")
  );

-- TripStatus (D-020 + D-010): mesmo padrão do QuoteStatus.
ALTER TABLE "TripStatus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TripStatus" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TripStatus"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  );

CREATE UNIQUE INDEX "TripStatus_code_system_default_key"
  ON "TripStatus" (code) WHERE "tenantId" IS NULL;

-- Semente: só os dois status necessários pra provar a distinção
-- interno/público (D-010) — não a taxonomia completa de status de viagem,
-- que é "assento reservado", não construído ainda.
INSERT INTO "TripStatus" (id, "tenantId", code, name, "isPublic", "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000011', NULL, 'PENDING_RISK_CLEARANCE', 'Aguardando liberação de risco', FALSE, now(), now()),
  ('00000000-0000-7000-8000-000000000012', NULL, 'IN_TRANSIT', 'Em trânsito', TRUE, now(), now());

-- Isolamento padrão (D-012) para RiskClearance e Trip.
ALTER TABLE "RiskClearance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskClearance" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "RiskClearance"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "Trip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trip" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Trip"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- DELETE revogado (D-017): RiskClearance é evidência de conformidade —
-- registro apagado depois de um sinistro é pior que não ter registro.
-- Trip é movimento (D-018) — "cancelada" é estado (status), não remoção.
-- UPDATE não é restrito por coluna nas duas: diferente de FreightRate/
-- Quote/Order, não há "valor congelado" aqui — status, liberação de
-- risco e composição de veículo mudam legitimamente ao longo da viagem.
REVOKE DELETE ON "RiskClearance" FROM mash_app;
REVOKE DELETE ON "Trip" FROM mash_app;
