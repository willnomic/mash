-- CreateTable
CREATE TABLE "PickupOrder" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "addressId" UUID NOT NULL,
    "locationLabel" TEXT,
    "pickupDate" DATE NOT NULL,
    "pickupWindow" TEXT,
    "businessHours" TEXT,
    "totalWeightKg" DECIMAL(10,3) NOT NULL,
    "totalVolumeCount" INTEGER NOT NULL,
    "totalCubicMeters" DECIMAL(10,3) NOT NULL,
    "laborNote" TEXT,
    "nfeReference" TEXT,
    "romaneioReference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickupOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupOrderItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pickupOrderId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "weightKg" DECIMAL(10,3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickupOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickupOrder_tenantId_branchId_idx" ON "PickupOrder"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "PickupOrder_tenantId_tripId_idx" ON "PickupOrder"("tenantId", "tripId");

-- CreateIndex
CREATE INDEX "PickupOrderItem_tenantId_pickupOrderId_idx" ON "PickupOrderItem"("tenantId", "pickupOrderId");

-- AddForeignKey
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupOrderItem" ADD CONSTRAINT "PickupOrderItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupOrderItem" ADD CONSTRAINT "PickupOrderItem_pickupOrderId_fkey" FOREIGN KEY ("pickupOrderId") REFERENCES "PickupOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Isolamento (D-012), mesmo padrão das demais tabelas.
ALTER TABLE "PickupOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PickupOrder" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "PickupOrder"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "PickupOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PickupOrderItem" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "PickupOrderItem"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Imutabilidade (D-011/D-017, mesmo critério de Order/CarrierHire): é
-- movimento, corrigir é emitir de novo, não editar. Nenhuma coluna
-- legitimamente muda depois de criada — revogação inteira, não GRANT por
-- coluna (mesmo critério de CarrierPayment).
REVOKE UPDATE ON "PickupOrder" FROM mash_app;
REVOKE DELETE ON "PickupOrder" FROM mash_app;

REVOKE UPDATE ON "PickupOrderItem" FROM mash_app;
REVOKE DELETE ON "PickupOrderItem" FROM mash_app;
