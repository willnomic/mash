-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('EMPLOYEE', 'SELF_EMPLOYED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAVALO_MECANICO', 'CARRETA', 'TRUCK', 'TOCO');

-- CreateEnum
CREATE TYPE "VehicleOwnership" AS ENUM ('OWNED', 'THIRD_PARTY');

-- CreateTable
CREATE TABLE "Driver" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "cnhNumber" TEXT NOT NULL,
    "cnhCategory" TEXT NOT NULL,
    "cnhValidUntil" DATE NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "renavam" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "ownership" "VehicleOwnership" NOT NULL,
    "capacityKg" DECIMAL(10,3) NOT NULL,
    "tareKg" DECIMAL(10,3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Driver_tenantId_active_idx" ON "Driver"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_tenantId_cpf_key" ON "Driver"("tenantId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_tenantId_cnhNumber_key" ON "Driver"("tenantId", "cnhNumber");

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_active_idx" ON "Vehicle"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_plate_key" ON "Vehicle"("tenantId", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_renavam_key" ON "Vehicle"("tenantId", "renavam");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CPF: formato básico (contagem de dígitos), mesmo critério de Customer.
-- Não é o dígito verificador (seção 1.6).
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_cpf_format"
  CHECK (cpf ~ '^[0-9]{11}$');

-- Isolamento (D-012), mesmo padrão das demais tabelas.
ALTER TABLE "Driver" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Driver" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Driver"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Vehicle"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Sem GRANT explícito: ALTER DEFAULT PRIVILEGES da primeira migração
-- (mesmo role mash_owner) já cobre tabela nova.
