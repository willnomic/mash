-- CreateTable
CREATE TABLE "OccurrenceType" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OccurrenceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "typeId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OccurrenceType_tenantId_code_key" ON "OccurrenceType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Occurrence_tenantId_branchId_idx" ON "Occurrence"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Occurrence_tenantId_tripId_idx" ON "Occurrence"("tenantId", "tripId");

-- CreateIndex
CREATE INDEX "Occurrence_tenantId_typeId_idx" ON "Occurrence"("tenantId", "typeId");

-- AddForeignKey
ALTER TABLE "OccurrenceType" ADD CONSTRAINT "OccurrenceType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "OccurrenceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- occurredAt (quando aconteceu na estrada) nunca é posterior a
-- createdAt (quando foi lançado no sistema) — garantido no banco, não
-- por disciplina da aplicação (mesmo critério de D-012/D-014/D-029).
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_occurredAt_not_after_createdAt"
  CHECK ("occurredAt" <= "createdAt");

-- OccurrenceType (D-020): mesmo padrão de QuoteStatus/TripStatus/
-- DeductionReason — tenantId nulo = padrão do sistema, catálogo
-- compartilhado (não dado isolado de outro tenant), leitura E escrita
-- liberam tenantId IS NULL.
ALTER TABLE "OccurrenceType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OccurrenceType" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "OccurrenceType"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  );

-- Só um tipo padrão por código (Postgres trata cada NULL como distinto
-- num índice único comum — mesmo problema e mesma solução do
-- QuoteStatus/TripStatus/DeductionReason).
CREATE UNIQUE INDEX "OccurrenceType_code_system_default_key"
  ON "OccurrenceType" (code) WHERE "tenantId" IS NULL;

-- Semente: só os dois tipos necessários pra provar a distinção
-- interna/pública (D-010) — não a taxonomia completa de tipos de
-- ocorrência, que é "assento reservado", não construída ainda (mesmo
-- critério do TripStatus).
INSERT INTO "OccurrenceType" (id, "tenantId", code, name, "isPublic", "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000201', NULL, 'DELAY', 'Atraso', TRUE, now(), now()),
  ('00000000-0000-7000-8000-000000000202', NULL, 'COMMERCIAL_HOLD', 'Retenção comercial', FALSE, now(), now());

-- Isolamento padrão (D-012) para Occurrence.
ALTER TABLE "Occurrence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Occurrence" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Occurrence"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Imutabilidade: tripId/typeId/branchId/occurredAt não mudam depois de
-- registrados. UPDATE só libera description e updatedAt (GRANT por
-- coluna, mesmo mecanismo do CarrierHire) — a ocorrência pode precisar
-- de correção de texto, mas não de trocar o que aconteceu, quando, ou
-- em qual viagem/filial.
REVOKE UPDATE ON "Occurrence" FROM mash_app;
GRANT UPDATE ("description", "updatedAt") ON "Occurrence" TO mash_app;

-- DELETE revogado (D-017): é registro do que aconteceu e alimenta o
-- cliente pela D-010 — mesmo critério de RiskClearance (D-023),
-- apagar depois é pior que não ter registrado.
REVOKE DELETE ON "Occurrence" FROM mash_app;
