-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "personType" "PersonType" NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" VARCHAR(11),
    "cnpj" VARCHAR(14),
    "ie" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "municipio" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "cep" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_tenantId_active_idx" ON "Customer"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_cpf_key" ON "Customer"("tenantId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_cnpj_key" ON "Customer"("tenantId", "cnpj");

-- CreateIndex
CREATE INDEX "Address_tenantId_customerId_idx" ON "Address"("tenantId", "customerId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Formato básico no banco (contagem de dígitos, só numérico) — não o
-- dígito verificador, que é lógica não trivial e não se responde de
-- memória (CLAUDE.md 1.6). Exatamente um de cpf/cnpj preenchido, e batendo
-- com personType — reforça D-018 (Customer é PF ou PJ, nunca os dois).
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_cpf_format"
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_cnpj_format"
  CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_document_matches_person_type"
  CHECK (
    ("personType" = 'INDIVIDUAL' AND cpf IS NOT NULL AND cnpj IS NULL) OR
    ("personType" = 'COMPANY' AND cnpj IS NOT NULL AND cpf IS NULL)
  );

-- CEP: 8 dígitos, fato estável do Correios, não regra fiscal variável —
-- diferente do que a seção 1.6 pede pra não afirmar de memória.
ALTER TABLE "Address" ADD CONSTRAINT "Address_cep_format"
  CHECK (cep ~ '^[0-9]{8}$');

-- Isolamento (D-012), mesmo padrão de User/Branch.
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Customer"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Address" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Address"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Sem GRANT explícito: ALTER DEFAULT PRIVILEGES da primeira migração
-- (mesmo role mash_owner) já cobre tabela nova.
