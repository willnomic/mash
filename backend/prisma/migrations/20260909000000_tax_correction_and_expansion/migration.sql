-- CreateEnum
CREATE TYPE "IncomeTaxRegime" AS ENUM ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');

-- CreateEnum
CREATE TYPE "IcmsOperationType" AS ENUM ('INTERNA', 'INTERESTADUAL_7', 'INTERESTADUAL_12');

-- NÃO derrubar "Order_customerReference_trgm_idx" (D-038) — o gerador de
-- diff do Prisma propõe isso de novo (mesma causa das migrações
-- anteriores: não entende índice GIN trigram criado via SQL cru).
-- Removido de propósito.

-- AlterTable
ALTER TABLE "TaxRate" ADD COLUMN     "composesPrice" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "icmsOperationType" "IcmsOperationType";

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "ibsCbsApurationRegime" TEXT,
ADD COLUMN     "incomeTaxRegime" "IncomeTaxRegime",
ADD COLUMN     "isSimplesIcmsContributor" BOOLEAN;

-- CreateTable
CREATE TABLE "IbsCbsTaxSituation" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "cst" CHAR(3) NOT NULL,
    "cClassTrib" CHAR(6) NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IbsCbsTaxSituation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxRate_taxType_icmsOperationType_idx" ON "TaxRate"("taxType", "icmsOperationType");

-- AddForeignKey
ALTER TABLE "IbsCbsTaxSituation" ADD CONSTRAINT "IbsCbsTaxSituation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill ANTES dos novos CHECKs (D-043, correção da D-041): as 27
-- linhas de ICMS já existentes são todas do caso INTERNA (origem e
-- destino na mesma UF, alíquota própria — nunca foram outra coisa, só
-- não existia a distinção ainda). Sem isso o CHECK abaixo
-- (taxType=ICMS exige icmsOperationType) rejeitaria as linhas que já
-- existem.
UPDATE "TaxRate" SET "icmsOperationType" = 'INTERNA' WHERE "taxType" = 'ICMS';

-- IBS/CBS nascem sem compor o preço (D-043, correção): durante a
-- calibragem (2026), são informativos — calculados e destacados no
-- documento, mas não somam ao valor cobrado do cliente
-- (docs/consulta-tributaria-2026-09.md). ICMS mantém composesPrice=true
-- (default da coluna, sem UPDATE aqui) — sempre esteve "por dentro" do
-- preço, isso não mudou.
UPDATE "TaxRate" SET "composesPrice" = false WHERE "taxType" IN ('IBS', 'CBS');

-- Troca o CHECK antigo (D-041: "ICMS sempre com uf") por dois novos —
-- D-043 quebrou essa regra de propósito: ICMS interestadual também tem
-- uf nulo (a alíquota não pertence a uma UF só, pertence à combinação de
-- grupos de UF). Duas constraints pequenas em vez de uma só com OR
-- grande, mesmo critério de legibilidade já usado em CarrierHire/
-- CarrierPayment (várias CHECK pequenas, cada uma com um motivo).
ALTER TABLE "TaxRate" DROP CONSTRAINT "TaxRate_uf_matches_tax_type";

ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_icms_operation_type_required" CHECK (
  ("taxType" = 'ICMS' AND "icmsOperationType" IS NOT NULL)
  OR
  ("taxType" IN ('IBS', 'CBS') AND "icmsOperationType" IS NULL)
);

-- As três primeiras condições são explicitamente guardadas com
-- "icmsOperationType" IS NOT NULL: sem isso, quando a coluna é NULL a
-- comparação "icmsOperationType" = 'INTERNA' avalia pra NULL (não
-- FALSE), e NULL OR FALSE OR FALSE também é NULL — Postgres trata CHECK
-- que avalia NULL como satisfeito, não violado. Sem a guarda, uma linha
-- IBS/CBS com uf preenchida passava despercebida (bug real, encontrado
-- por teste e corrigido nesta mesma migração antes de commitar).
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_uf_matches_operation_type" CHECK (
  ("icmsOperationType" IS NOT NULL AND "icmsOperationType" = 'INTERNA' AND "uf" IS NOT NULL)
  OR
  ("icmsOperationType" IS NOT NULL AND "icmsOperationType" IN ('INTERESTADUAL_7', 'INTERESTADUAL_12') AND "uf" IS NULL)
  OR
  ("icmsOperationType" IS NULL AND "uf" IS NULL)
);

-- Recria o EXCLUDE de sobreposição de vigência incluindo
-- icmsOperationType (D-043) — sem isso, as duas linhas novas de ICMS
-- interestadual (7% e 12%, ambas com uf NULO) colidiriam entre si no
-- EXCLUDE antigo: coalesce(uf,'') dava a MESMA chave ('') pras duas,
-- fazendo o banco enxergar "mesmo tributo, mesma UF, datas sobrepostas"
-- mesmo sendo alíquotas de casos diferentes.
--
-- CASE em vez de coalesce(icmsOperationType::text, '') — testado nesta
-- sessão contra o banco real: o cast enum→text (mesmo dentro de
-- coalesce) faz o Postgres recusar a criação do índice GiST com "functions
-- in index expression must be marked IMMUTABLE" (a função de cast
-- gerada automaticamente pro enum não é IMMUTABLE aos olhos do
-- otimizador, mesmo sendo determinística na prática). Um CASE que só
-- compara o enum a seus próprios valores e devolve literais de texto,
-- sem chamar função de cast nenhuma, não tem esse problema — verificado
-- isoladamente numa tabela de teste antes de usar aqui.
--
-- Resultado: distingue INTERESTADUAL_7 de INTERESTADUAL_12 mesmo os
-- dois com uf nulo, e não muda nada pro caso INTERNA (uf já distingue)
-- nem pra IBS/CBS (icmsOperationType nulo pros dois, cai no ELSE '' —
-- mesma chave que já tinham antes, comportamento inalterado).
ALTER TABLE "TaxRate" DROP CONSTRAINT "TaxRate_no_overlapping_validity";

ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_no_overlapping_validity"
  EXCLUDE USING gist (
    "taxType" WITH =,
    coalesce("uf", '') WITH =,
    (CASE "icmsOperationType"
       WHEN 'INTERNA' THEN 'INTERNA'
       WHEN 'INTERESTADUAL_7' THEN 'INTERESTADUAL_7'
       WHEN 'INTERESTADUAL_12' THEN 'INTERESTADUAL_12'
       ELSE ''
     END) WITH =,
    daterange("validFrom", "validTo", '[)') WITH &&
  );

-- Semente: ICMS interestadual — regra do Senado (Resolução, citada na
-- consulta tributária, docs/consulta-tributaria-2026-09.md), não valor
-- de memória (CLAUDE.md 1.6) — os dois números (7%/12%) vieram da
-- consulta, mesma proveniência de IBS 0,1%/CBS 0,9% (D-041, dado do
-- usuário). isPlaceholder=false por isso — não é chute uniforme como as
-- 27 linhas de ICMS interna. uf nulo: a alíquota não é de uma UF, é da
-- COMBINAÇÃO de grupos de origem/destino (TaxRateService.
-- findInterstateIcmsRate resolve qual das duas linhas usar).
INSERT INTO "TaxRate" (id, "taxType", "uf", "icmsOperationType", "rate", "validFrom", "validTo", "isPlaceholder", "composesPrice", "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-00000000005e', 'ICMS', NULL, 'INTERESTADUAL_7',  '7.0000',  '2026-01-01', '9999-12-31', false, true, now(), now()),
  ('00000000-0000-7000-8000-00000000005f', 'ICMS', NULL, 'INTERESTADUAL_12', '12.0000', '2026-01-01', '9999-12-31', false, true, now(), now());

-- IbsCbsTaxSituation (D-043): mesmo padrão QuoteCostType/QuoteStatus
-- (D-020) — tenantId nulo = padrão do sistema, catálogo compartilhado
-- (leitura E escrita liberam tenantId IS NULL, não isolamento padrão).
ALTER TABLE "IbsCbsTaxSituation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IbsCbsTaxSituation" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "IbsCbsTaxSituation"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  );

-- Só uma combinação padrão do sistema por CST+cClassTrib (mesma
-- armadilha de NULL que QuoteStatus/TripStatus/QuoteCostType já
-- resolveram: a unicidade tenantId+cst+cClassTrib do Prisma não protege
-- NULL, Postgres trata cada NULL como distinto num índice único comum).
CREATE UNIQUE INDEX "IbsCbsTaxSituation_cst_cClassTrib_system_default_key"
  ON "IbsCbsTaxSituation" (cst, "cClassTrib") WHERE "tenantId" IS NULL;

-- Semente: só o caso padrão (consulta tributária) — transporte
-- rodoviário de carga tributado integralmente. A tabela oficial tem mais
-- de 160 combinações, atualizada por Nota Técnica — não replicada aqui
-- (pendência registrada em docs/decisoes.md D-043).
INSERT INTO "IbsCbsTaxSituation" (id, "tenantId", cst, "cClassTrib", name, "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000061', NULL, '000', '000001', 'Tributação integral — transporte rodoviário de carga', now(), now());
