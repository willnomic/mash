-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('ICMS', 'IBS', 'CBS');

-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_freightRateId_fkey";

-- NÃO derrubar "Order_customerReference_trgm_idx" (D-038) — o gerador de
-- diff do Prisma propôs isso porque não entende índice GIN trigram
-- (criado via SQL cru, sem representação nativa no schema.prisma); a
-- linha original foi removida daqui de propósito, não esquecida.

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "cbsRateApplied" DECIMAL(7,4),
ADD COLUMN     "ibsRateApplied" DECIMAL(7,4),
ADD COLUMN     "icmsRateApplied" DECIMAL(7,4),
ADD COLUMN     "icmsUf" CHAR(2),
ADD COLUMN     "marginPercentage" DECIMAL(7,4),
ALTER COLUMN "freightRateId" DROP NOT NULL,
ALTER COLUMN "rate" DROP NOT NULL,
ALTER COLUMN "minimumFreight" DROP NOT NULL,
ALTER COLUMN "additionalPercentage" DROP NOT NULL,
ALTER COLUMN "total" DROP NOT NULL;

-- CreateTable
CREATE TABLE "QuoteCostType" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuoteCostType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteCostLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "costTypeId" UUID NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteCostLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" UUID NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "uf" CHAR(2),
    "rate" DECIMAL(7,4) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteCostType_tenantId_code_key" ON "QuoteCostType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "QuoteCostLine_tenantId_quoteId_idx" ON "QuoteCostLine"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "TaxRate_taxType_uf_idx" ON "TaxRate"("taxType", "uf");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_freightRateId_fkey" FOREIGN KEY ("freightRateId") REFERENCES "FreightRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteCostType" ADD CONSTRAINT "QuoteCostType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteCostLine" ADD CONSTRAINT "QuoteCostLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteCostLine" ADD CONSTRAINT "QuoteCostLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteCostLine" ADD CONSTRAINT "QuoteCostLine_costTypeId_fkey" FOREIGN KEY ("costTypeId") REFERENCES "QuoteCostType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dois caminhos de precificação, nunca misturados na mesma linha (D-041):
-- TABELA (freightRateId + rate/minimumFreight/additionalPercentage) ou
-- CUSTO (marginPercentage + icmsUf). total/icmsRateApplied/
-- ibsRateApplied/cbsRateApplied ficam fora do CHECK: são comuns aos dois
-- caminhos (TABELA já sai com total no INSERT) ou só existem depois do
-- fechamento (caminho CUSTO) — não há invariante estática a verificar
-- neles no momento da escrita.
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_pricing_path_exclusive" CHECK (
  (
    "freightRateId" IS NOT NULL
    AND "rate" IS NOT NULL
    AND "minimumFreight" IS NOT NULL
    AND "additionalPercentage" IS NOT NULL
    AND "marginPercentage" IS NULL
    AND "icmsUf" IS NULL
  )
  OR
  (
    "freightRateId" IS NULL
    AND "rate" IS NULL
    AND "minimumFreight" IS NULL
    AND "additionalPercentage" IS NULL
    AND "marginPercentage" IS NOT NULL
    AND "icmsUf" IS NOT NULL
  )
);

-- Novo UPDATE liberado em Quote (D-041, GRANT por coluna — mesmo
-- mecanismo do FreightRate/statusId já existente): as quatro colunas que
-- o fechamento do caminho CUSTO precisa preencher depois do INSERT.
-- freightRateId/rate/minimumFreight/additionalPercentage/
-- marginPercentage/icmsUf seguem fora do GRANT — nunca mudam depois de
-- criados, nos dois caminhos.
GRANT UPDATE ("icmsRateApplied", "ibsRateApplied", "cbsRateApplied", "total") ON "Quote" TO mash_app;

-- QuoteCostType (D-041, D-020): mesmo padrão QuoteStatus/DeductionReason
-- — tenantId nulo = padrão do sistema, catálogo compartilhado (leitura E
-- escrita liberam tenantId IS NULL, não isolamento padrão).
ALTER TABLE "QuoteCostType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuoteCostType" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "QuoteCostType"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  );

-- Só um tipo padrão por código (mesma armadilha de NULL que QuoteStatus/
-- TripStatus já resolveram: a unicidade tenantId+code do Prisma não
-- protege NULL, Postgres trata cada NULL como distinto num índice único
-- comum).
CREATE UNIQUE INDEX "QuoteCostType_code_system_default_key"
  ON "QuoteCostType" (code) WHERE "tenantId" IS NULL;

-- Semente: os cinco tipos que o pedido cita nominalmente — frete
-- estimado do terceiro, pedágio, combustível, seguro, taxas. Código em
-- inglês (D-007), name em português pra tela (D-008).
INSERT INTO "QuoteCostType" (id, "tenantId", code, name, "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000031', NULL, 'FREIGHT',   'Frete terceiro', now(), now()),
  ('00000000-0000-7000-8000-000000000032', NULL, 'TOLL',      'Pedágio',        now(), now()),
  ('00000000-0000-7000-8000-000000000033', NULL, 'FUEL',      'Combustível',    now(), now()),
  ('00000000-0000-7000-8000-000000000034', NULL, 'INSURANCE', 'Seguro',         now(), now()),
  ('00000000-0000-7000-8000-000000000035', NULL, 'FEES',      'Taxas',          now(), now());

-- QuoteCostLine (D-041): isolamento padrão (D-012) — é dado do tenant,
-- não catálogo compartilhado.
ALTER TABLE "QuoteCostLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuoteCostLine" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "QuoteCostLine"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Imutável por inteiro desde a criação (D-041, mesmo critério de
-- PickupOrderItem/CarrierPayment): nenhuma coluna aqui legitimamente
-- muda depois de criada, sem exceção. "Congela no fechamento" (o pedido)
-- fica satisfeito de graça — a linha nunca foi editável.
REVOKE UPDATE, DELETE ON "QuoteCostLine" FROM mash_app;

-- TaxRate (D-041): SEM isolamento de tenant — é valor de lei, não
-- configuração de tenant (ver comentário no schema.prisma). RLS
-- obrigatório mesmo assim (guarda de schema, D-012), mas a política é
-- `USING (true)` — mesmo mecanismo já usado no SELECT de Tenant.slug
-- (D-029). mash_app só enxerga SELECT: mudar alíquota é migração
-- revisada, nunca escrita da aplicação — não há caminho de negócio que
-- precise INSERT/UPDATE/DELETE aqui hoje, e "não inventar autoridade
-- sobre valor de lei" (CLAUDE.md 1.6) pesa mais que deixar a porta
-- aberta pra uma tela futura que ainda não existe.
ALTER TABLE "TaxRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxRate" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TaxRate"
  USING (true)
  WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON "TaxRate" FROM mash_app;

-- ICMS sempre com UF, IBS/CBS sempre nacional (uf nulo) — garantido no
-- banco, não só pela semente. Sem isso, nada impediria uma linha futura
-- de ICMS sem UF (ambígua: vale pra qual estado?) ou de IBS/CBS com UF
-- (o modelo de 2026 é nacional pros dois, LC 214/2025).
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_uf_matches_tax_type" CHECK (
  ("taxType" = 'ICMS' AND "uf" IS NOT NULL)
  OR
  ("taxType" IN ('IBS', 'CBS') AND "uf" IS NULL)
);

-- Sobreposição de vigência (D-041, mesmo mecanismo do FreightRate/D-014):
-- duas alíquotas do mesmo tributo (e mesma UF, quando aplicável) não
-- podem valer ao mesmo tempo. coalesce("uf", '') no lugar de "uf" puro:
-- EXCLUDE, como UNIQUE, trata cada NULL como distinto de outro NULL, e
-- IBS/CBS (uf sempre nulo) nunca colidiriam entre si sem essa
-- normalização — mesma armadilha de NULL já resolvida em QuoteStatus/
-- DeductionReason (lá com índice parcial; aqui, dentro do próprio
-- EXCLUDE). btree_gist já habilitado desde a migração do FreightRate.
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_no_overlapping_validity"
  EXCLUDE USING gist (
    "taxType" WITH =,
    coalesce("uf", '') WITH =,
    daterange("validFrom", "validTo", '[)') WITH &&
  );

-- Semente: IBS e CBS nacionais (LC 214/2025, alíquotas de teste do ano de
-- calibragem 2026 — 0,1% e 0,9%, valor dado pelo usuário, não inferido
-- de memória fiscal, seção 1.6 do CLAUDE.md).
INSERT INTO "TaxRate" (id, "taxType", "uf", "rate", "validFrom", "validTo", "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000041', 'IBS', NULL, '0.1000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000042', 'CBS', NULL, '0.9000', '2026-01-01', '9999-12-31', now(), now());

-- Semente: ICMS por UF — 27 linhas, TODAS com o MESMO valor (18%),
-- deliberadamente uniforme. NÃO é 27 alíquotas pesquisadas por estado:
-- é um placeholder plausível (nem 0%, nem absurdo) só pra tabela nascer
-- populada. Números diferentes por UF pareceriam pesquisados mesmo com
-- comentário dizendo o contrário — um valor uniforme deixa claro que
-- nenhuma autoridade fiscal foi assumida (CLAUDE.md 1.6: "isso depende
-- de regra fiscal que eu não posso verificar aqui"). MARCADO A CALIBRAR
-- COM O CONTADOR — ver docs/decisoes.md D-041.
INSERT INTO "TaxRate" (id, "taxType", "uf", "rate", "validFrom", "validTo", "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000043', 'ICMS', 'AC', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000044', 'ICMS', 'AL', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000045', 'ICMS', 'AP', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000046', 'ICMS', 'AM', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000047', 'ICMS', 'BA', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000048', 'ICMS', 'CE', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000049', 'ICMS', 'DF', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000004a', 'ICMS', 'ES', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000004b', 'ICMS', 'GO', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000004c', 'ICMS', 'MA', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000004d', 'ICMS', 'MT', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000004e', 'ICMS', 'MS', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000004f', 'ICMS', 'MG', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000050', 'ICMS', 'PA', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000051', 'ICMS', 'PB', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000052', 'ICMS', 'PR', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000053', 'ICMS', 'PE', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000054', 'ICMS', 'PI', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000055', 'ICMS', 'RJ', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000056', 'ICMS', 'RN', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000057', 'ICMS', 'RS', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000058', 'ICMS', 'RO', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-000000000059', 'ICMS', 'RR', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000005a', 'ICMS', 'SC', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000005b', 'ICMS', 'SP', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000005c', 'ICMS', 'SE', '18.0000', '2026-01-01', '9999-12-31', now(), now()),
  ('00000000-0000-7000-8000-00000000005d', 'ICMS', 'TO', '18.0000', '2026-01-01', '9999-12-31', now(), now());
