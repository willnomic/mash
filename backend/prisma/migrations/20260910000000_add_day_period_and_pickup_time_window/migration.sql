-- DayPeriod (D-020) — período do dia (janela de tempo em linguagem
-- natural, tipo TimeWindow/DayPeriodCode já em shared/src/time-window).
-- Mesmo padrão de OrderStatus/QuoteCostType: tenantId nulo = padrão do
-- sistema, catálogo compartilhado.
CREATE TABLE "DayPeriod" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayPeriod_tenantId_code_key" ON "DayPeriod"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "DayPeriod" ADD CONSTRAINT "DayPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (D-012 + D-020, mesmo padrão do OrderStatus/QuoteCostType/
-- TripStatus): tenantId nulo = padrão do sistema, visível e gravável por
-- qualquer tenant — não é isolamento padrão.
ALTER TABLE "DayPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DayPeriod" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "DayPeriod"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (
    "tenantId" IS NULL
    OR "tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid
  );

-- Só um período padrão por código (mesma armadilha do OrderStatus/
-- QuoteCostType/TripStatus: a unicidade tenantId+code do Prisma
-- (@@unique acima) não protege a linha NULL — Postgres trata cada NULL
-- como distinto num índice único comum).
CREATE UNIQUE INDEX "DayPeriod_code_system_default_key"
  ON "DayPeriod" (code) WHERE "tenantId" IS NULL;

-- Semente: os nove períodos confirmados em dado real (planilha
-- operacional de 2025, shared/src/time-window/time-window.parser.ts) —
-- não a taxonomia completa, mesmo critério que já semeou só três
-- OrderStatus e dois TripStatus. Código em inglês (D-007); name já carrega
-- o rótulo em português (D-008) — é esse rótulo que formatTimeWindow usa
-- (o pacote compartilhado não guarda tradução).
INSERT INTO "DayPeriod" (id, "tenantId", code, name, "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000071', NULL, 'MORNING',         'Pela manhã',      now(), now()),
  ('00000000-0000-7000-8000-000000000072', NULL, 'LATE_MORNING',    'Final da manhã',  now(), now()),
  ('00000000-0000-7000-8000-000000000073', NULL, 'MIDDAY',          'Meio-dia',        now(), now()),
  ('00000000-0000-7000-8000-000000000074', NULL, 'EARLY_AFTERNOON', 'Início da tarde', now(), now()),
  ('00000000-0000-7000-8000-000000000075', NULL, 'AFTERNOON',       'Pela tarde',      now(), now()),
  ('00000000-0000-7000-8000-000000000076', NULL, 'END_OF_DAY',      'Final do dia',    now(), now()),
  ('00000000-0000-7000-8000-000000000077', NULL, 'EVENING',         'À noite',         now(), now()),
  ('00000000-0000-7000-8000-000000000078', NULL, 'FIRST_HOUR',      'Primeira hora',   now(), now()),
  ('00000000-0000-7000-8000-000000000079', NULL, 'ALL_DAY',         'O dia inteiro',   now(), now());

-- GRANT: segue OrderStatus, sem inventar variação (D-020) — SELECT/
-- INSERT/UPDATE/DELETE de ALTER DEFAULT PRIVILEGES (migração inicial,
-- 20260904004121_init_tenant) já cobrem toda tabela nova; RLS acima é
-- quem restringe de verdade. Nenhum REVOKE nesta tabela.

-- PickupOrder: RENAME de pickupWindow pra pickupTimeNote. ALTER ...
-- RENAME COLUMN, não DROP+ADD (mesmo critério de D-031/D-033) — não há
-- dado de produção ainda, mas o histórico da coluna importa. RENAME
-- COLUMN precisa ser instrução própria no Postgres, não combina com
-- outras cláusulas de ALTER TABLE na mesma instrução.
ALTER TABLE "PickupOrder" RENAME COLUMN "pickupWindow" TO "pickupTimeNote";

-- Janela de tempo estruturada — TimeWindow de @mash/shared materializado
-- em coluna (pendência técnica de decisoes.md, fechada aqui). Hora como
-- texto "HH:mm" (VARCHAR(5)), NÃO time nativo do Postgres: @db.Time do
-- Prisma volta pro TypeScript como objeto Date com data de 1970-01-01
-- embutida, reabrindo a confusão de fuso que a D-016 manda evitar — hora
-- sem data ganharia fuso implícito de novo — e @mash/shared já trata hora
-- como string em todo o pacote (parseTimeWindow/formatTimeWindow). "HH:mm"
-- com zero à esquerda ordena corretamente em comparação lexicográfica de
-- texto, então os CHECK abaixo (end < start, end >= start) funcionam no
-- banco exatamente como funcionariam com um tipo de hora nativo.
--
-- pickupDate vira NULLABLE — existem PickupOrder de teste sem data hoje
-- (nada no banco até aqui exigia). Vira NOT NULL quando a tela for a
-- única porta de criação de PickupOrder. Colunas novas sem backfill:
-- nascem NULL/false (endsNextDay) em toda linha existente.
ALTER TABLE "PickupOrder"
  ALTER COLUMN "pickupDate" DROP NOT NULL,
  ADD COLUMN "pickupStartTime" VARCHAR(5),
  ADD COLUMN "pickupEndTime" VARCHAR(5),
  ADD COLUMN "pickupEndsNextDay" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pickupDayPeriodId" UUID;

-- AddForeignKey
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_pickupDayPeriodId_fkey" FOREIGN KEY ("pickupDayPeriodId") REFERENCES "DayPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- As cinco invariantes de TimeWindow (shared/src/time-window/
-- time-window.types.ts, validateTimeWindow) impostas no banco, não só no
-- TypeScript — a invariante mora onde o dado é escrito, mesmo princípio
-- já usado no TaxRate (D-043). Cada comparação que pode receber NULL é
-- guardada explicitamente com IS NOT NULL / IS NULL antes de qualquer =,
-- <, >= — sem a guarda, "coluna = valor" com coluna NULL avalia pra NULL
-- (não FALSE), e o Postgres trata CHECK que avalia NULL como satisfeito,
-- não violado. Esse exato bug já apareceu num CHECK parecido do TaxRate
-- (D-043) e só foi pego por teste — testado de novo aqui, ver
-- test/pickup-order-time-window-check.e2e-spec.ts.

-- (a) Formato: quando preenchidos, start/end são "HH:mm" válido (00–23 : 00–59).
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_pickup_time_format" CHECK (
  ("pickupStartTime" IS NULL OR "pickupStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND
  ("pickupEndTime" IS NULL OR "pickupEndTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- (b) dayPeriodId preenchido exige start/end nulos e endsNextDay falso —
-- período nomeado e horário explícito são excludentes (mesma regra que o
-- parser resolve em shared/src/time-window/time-window.parser.ts quando
-- os dois aparecem juntos no texto original: o horário ganha, o período
-- nunca chega a virar dayPeriodCode).
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_pickup_day_period_excludes_time" CHECK (
  "pickupDayPeriodId" IS NULL
  OR (
    "pickupStartTime" IS NULL
    AND "pickupEndTime" IS NULL
    AND "pickupEndsNextDay" = false
  )
);

-- (c) endsNextDay verdadeiro exige start E end preenchidos.
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_pickup_ends_next_day_requires_both" CHECK (
  "pickupEndsNextDay" = false
  OR ("pickupStartTime" IS NOT NULL AND "pickupEndTime" IS NOT NULL)
);

-- (d) endsNextDay verdadeiro exige end < start (janela cruza meia-noite).
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_pickup_ends_next_day_order" CHECK (
  "pickupEndsNextDay" = false
  OR (
    "pickupStartTime" IS NOT NULL
    AND "pickupEndTime" IS NOT NULL
    AND "pickupEndTime" < "pickupStartTime"
  )
);

-- (e) endsNextDay falso, com os dois preenchidos, exige end >= start.
ALTER TABLE "PickupOrder" ADD CONSTRAINT "PickupOrder_pickup_time_order" CHECK (
  "pickupEndsNextDay" = true
  OR "pickupStartTime" IS NULL
  OR "pickupEndTime" IS NULL
  OR "pickupEndTime" >= "pickupStartTime"
);

-- GRANT: PickupOrder já é imutável (UPDATE/DELETE revogados na migração
-- 20260907051937_add_pickup_order) — as colunas novas entram só no
-- INSERT, mesmo mecanismo cobre tudo, nenhum GRANT/REVOKE novo aqui.
