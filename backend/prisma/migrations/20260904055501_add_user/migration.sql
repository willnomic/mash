-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OPERATOR', 'MANAGER', 'FINANCE', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_tenantId_active_idx" ON "User"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Isolamento (D-012). nullif(...,'') antes do cast: numa conexão de pool já
-- usada, current_setting volta '' (não NULL) depois do commit — sem isso o
-- cast para uuid estoura em vez de falhar fechado com zero linhas
-- (docs/d012-multi-tenant-rls.md).
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "User"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Sem GRANT explícito aqui: ALTER DEFAULT PRIVILEGES da migração anterior
-- (mesmo role mash_owner) já cobre tabela nova. Confirmado pelos testes de
-- isolamento desta migração, que dependem de mash_app conseguir ler/gravar.
