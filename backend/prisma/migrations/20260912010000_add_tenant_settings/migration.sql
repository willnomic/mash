-- Unidade "configuração do tenant — prazo padrão de validade da
-- cotação": primeira configuração real do produto (D-020 já previa um
-- SettingsService "desde o primeiro dia", nunca construído).
--
-- Nota sobre o diff bruto do Prisma: duas linhas removidas por não
-- serem desta mudança — DROP INDEX "Order_customerReference_trgm_idx"
-- e DROP INDEX "Party_name_trgm_idx" são os mesmos falsos positivos já
-- documentados nas migrações anteriores (índices GIN trigram criados à
-- mão, invisíveis ao diff do Prisma).

-- Fixo pelo SISTEMA (o cálculo de data que @mash/shared sabe fazer),
-- não lista que o tenant estende (D-020) — sem caminho de negócio pra
-- um tenant "inventar uma unidade nova" de prazo.
CREATE TYPE "QuoteValidityUnit" AS ENUM ('DAYS', 'MONTHS', 'YEARS', 'NEVER');

-- Tabela filha 1:1 com Tenant, existência OPCIONAL (mesmo padrão de
-- CarrierProfile, D-032) — a linha só nasce quando o gestor salva pela
-- primeira vez (TenantSettingsService faz upsert), nunca junto do
-- tenant. "Tenant não configurou nada" (linha ausente) e "tenant
-- configurou algo" são estados diferentes que a aplicação precisa
-- distinguir — nascer com todo campo nulo automaticamente inventaria
-- uma configuração que ninguém pediu (D-052).
CREATE TABLE "TenantSettings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "defaultQuoteValidityUnit" "QuoteValidityUnit",
    "defaultQuoteValidityAmount" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");

ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Guarda explícita de NULL (D-043), mesmo mecanismo de
-- Quote_pricing_path_exclusive: exatamente três formas válidas —
-- (1) NULO+NULO = ninguém decidiu, (2) NEVER+NULO = decisão explícita
-- de nunca vencer, (3) DAYS/MONTHS/YEARS+amount>0 = prazo com número.
-- Qualquer combinação fora dessas três (ex.: NEVER com amount
-- preenchido, ou DAYS sem amount) é recusada pelo banco, não só pela
-- aplicação.
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_quote_validity_shape" CHECK (
  ("defaultQuoteValidityUnit" IS NULL AND "defaultQuoteValidityAmount" IS NULL)
  OR ("defaultQuoteValidityUnit" = 'NEVER' AND "defaultQuoteValidityAmount" IS NULL)
  OR (
    "defaultQuoteValidityUnit" IN ('DAYS', 'MONTHS', 'YEARS')
    AND "defaultQuoteValidityAmount" IS NOT NULL
    AND "defaultQuoteValidityAmount" > 0
  )
);

-- RLS: isolamento padrão por tenant (D-012/D-035), mesmo mecanismo de
-- toda tabela nova.
ALTER TABLE "TenantSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantSettings" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TenantSettings"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);
