-- Unidade "datas na viagem" (origem e janelas nas duas pontas da Trip,
-- Address ganha dono anulável e horário, OccurrenceType ganha devolução
-- de vazio). Nota: `prisma migrate diff --from-config-datasource
-- --to-schema=prisma/schema.prisma --script` também apontou duas
-- instruções de outra origem (DROP INDEX "Order_customerReference_trgm_idx"/
-- "Party_name_trgm_idx" e CREATE UNIQUE INDEX em IbsCbsTaxSituation) —
-- drift pré-existente já registrado como "achado de higiene, terceira
-- ocorrência" na D-046, sem relação com esta unidade. Deliberadamente
-- FORA deste arquivo.

-- Address: partyId vira anulável (unidade "datas na viagem"). Hoje é
-- NOT NULL desde a criação da tabela (20260904070857_add_customer_address,
-- então Customer) — terminal/porto recorrente e coleta esporádica usam o
-- MESMO Address, o que muda é ter dono ou não (ver comentário em
-- schema.prisma). FK mantém ON DELETE RESTRICT (não muda de
-- comportamento: só a NOT NULL da coluna cai, a constraint de FK em si
-- nem precisa ser recriada).
ALTER TABLE "Address"
  ALTER COLUMN "partyId" DROP NOT NULL,
  ADD COLUMN "businessHours" TEXT;

-- Trip: origem da perna, mesmo padrão de destinationAddressId (D-047) —
-- anulável, preenchida na operação. FK ON DELETE SET NULL ON UPDATE
-- CASCADE, igual destinationAddressId (Trip nunca teve REVOKE de UPDATE,
-- então atribuir depois já funciona com o privilégio default).
ALTER TABLE "Trip" ADD COLUMN "originAddressId" UUID;

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_originAddressId_fkey"
  FOREIGN KEY ("originAddressId") REFERENCES "Address"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Janela de tempo estruturada nas duas pontas — TimeWindow de
-- @mash/shared materializado em coluna, padrão IDÊNTICO ao da D-045
-- (PickupOrder), só com o prefixo trocado de "pickup" para "origin"/
-- "destination". Hora como texto "HH:mm" (VARCHAR(5)), não time nativo do
-- Postgres (@db.Time voltaria como Date de 1970 com fuso implícito,
-- reabrindo a confusão que a D-016 manda evitar) — exceção deliberada à
-- D-016, mesmo motivo da D-045: é hora de parede local acordada com um
-- lugar ("8h no terminal de Itapoá"), não instante. endsNextDay em vez de
-- segunda data, pelo mesmo motivo da D-045 (ambiguidade de qual data usar
-- num filtro "o que tem pra hoje"). Precisão sempre derivada por
-- precisionOf() (@mash/shared), nunca gravada.
ALTER TABLE "Trip"
  ADD COLUMN "originDate" DATE,
  ADD COLUMN "originStartTime" VARCHAR(5),
  ADD COLUMN "originEndTime" VARCHAR(5),
  ADD COLUMN "originEndsNextDay" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "originDayPeriodId" UUID,
  ADD COLUMN "originTimeNote" TEXT,
  ADD COLUMN "destinationDate" DATE,
  ADD COLUMN "destinationStartTime" VARCHAR(5),
  ADD COLUMN "destinationEndTime" VARCHAR(5),
  ADD COLUMN "destinationEndsNextDay" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "destinationDayPeriodId" UUID,
  ADD COLUMN "destinationTimeNote" TEXT;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_originDayPeriodId_fkey"
  FOREIGN KEY ("originDayPeriodId") REFERENCES "DayPeriod"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destinationDayPeriodId_fkey"
  FOREIGN KEY ("destinationDayPeriodId") REFERENCES "DayPeriod"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- As cinco invariantes de TimeWindow (shared/src/time-window/
-- time-window.types.ts, validateTimeWindow), impostas no banco pela
-- SEGUNDA vez (a primeira foi PickupOrder, D-045) — dez CHECK ao todo,
-- cinco por ponta, mesma redação da D-045 com o prefixo trocado. Cada
-- comparação que pode receber NULL é guardada explicitamente com
-- IS NOT NULL / IS NULL antes de =, <, >= — sem a guarda, "coluna = valor"
-- com coluna NULL avalia pra NULL (não FALSE), e o Postgres trata CHECK
-- que avalia NULL como satisfeito, não violado (mesmo bug real já visto
-- em CHECK parecido do TaxRate, D-043, e testado de novo aqui — ver
-- test/trip-time-window-check.e2e-spec.ts).

-- ORIGEM

-- (a) Formato: quando preenchidos, start/end são "HH:mm" válido (00–23 : 00–59).
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_origin_time_format" CHECK (
  ("originStartTime" IS NULL OR "originStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND
  ("originEndTime" IS NULL OR "originEndTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- (b) dayPeriodId preenchido exige start/end nulos e endsNextDay falso.
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_origin_day_period_excludes_time" CHECK (
  "originDayPeriodId" IS NULL
  OR (
    "originStartTime" IS NULL
    AND "originEndTime" IS NULL
    AND "originEndsNextDay" = false
  )
);

-- (c) endsNextDay verdadeiro exige start E end preenchidos.
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_origin_ends_next_day_requires_both" CHECK (
  "originEndsNextDay" = false
  OR ("originStartTime" IS NOT NULL AND "originEndTime" IS NOT NULL)
);

-- (d) endsNextDay verdadeiro exige end < start (janela cruza meia-noite).
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_origin_ends_next_day_order" CHECK (
  "originEndsNextDay" = false
  OR (
    "originStartTime" IS NOT NULL
    AND "originEndTime" IS NOT NULL
    AND "originEndTime" < "originStartTime"
  )
);

-- (e) endsNextDay falso, com os dois preenchidos, exige end >= start.
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_origin_time_order" CHECK (
  "originEndsNextDay" = true
  OR "originStartTime" IS NULL
  OR "originEndTime" IS NULL
  OR "originEndTime" >= "originStartTime"
);

-- DESTINO (mesmas cinco invariantes)

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destination_time_format" CHECK (
  ("destinationStartTime" IS NULL OR "destinationStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND
  ("destinationEndTime" IS NULL OR "destinationEndTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destination_day_period_excludes_time" CHECK (
  "destinationDayPeriodId" IS NULL
  OR (
    "destinationStartTime" IS NULL
    AND "destinationEndTime" IS NULL
    AND "destinationEndsNextDay" = false
  )
);

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destination_ends_next_day_requires_both" CHECK (
  "destinationEndsNextDay" = false
  OR ("destinationStartTime" IS NOT NULL AND "destinationEndTime" IS NOT NULL)
);

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destination_ends_next_day_order" CHECK (
  "destinationEndsNextDay" = false
  OR (
    "destinationStartTime" IS NOT NULL
    AND "destinationEndTime" IS NOT NULL
    AND "destinationEndTime" < "destinationStartTime"
  )
);

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destination_time_order" CHECK (
  "destinationEndsNextDay" = true
  OR "destinationStartTime" IS NULL
  OR "destinationEndTime" IS NULL
  OR "destinationEndTime" >= "destinationStartTime"
);

-- GRANT: Trip nunca teve REVOKE de UPDATE (só DELETE, migração
-- 20260904081754_add_trip) — as colunas novas entram no privilégio
-- default, nenhum GRANT/REVOKE novo necessário aqui.

-- OccurrenceType (D-020): devolução de vazio é o encerramento do ciclo da
-- MESMA viagem, não viagem nova nem terceira data (sócio) — por isso
-- entra como linha nova de OccurrenceType, não como coluna/model novo.
-- isPublic = FALSE (confirmado com o sócio): devolução de vazio é
-- operação interna entre transportadora e armador — o embarcador não
-- acompanha, e é onde o demurrage aparece. Expor atraso de devolução ao
-- cliente expõe um custo que pode virar discussão comercial. Exposição é
-- caminho sem volta (fechado agora abre depois; aberto agora, alguém já
-- viu) — o portal do embarcador é v1.1 de qualquer forma (D-010/D-039).
-- Free time/demurrage continuam fora de escopo, aqui só o registro do
-- evento.
INSERT INTO "OccurrenceType" (id, "tenantId", code, name, "isPublic", "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000203', NULL, 'EMPTY_RETURN', 'Devolução de vazio', FALSE, now(), now());
