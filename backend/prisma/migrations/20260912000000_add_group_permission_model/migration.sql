-- Unidade "papéis e permissões": usuário → grupo → permissões, com
-- marcador de administrador que ignora grupo (pesquisa de mercado —
-- ESL Cloud, Senior — nenhum TMS de referência fixa papel no código).
--
-- Nota sobre o diff bruto do Prisma: duas linhas removidas por não
-- serem desta mudança — DROP INDEX "Order_customerReference_trgm_idx"
-- e DROP INDEX "Party_name_trgm_idx" são os mesmos falsos positivos já
-- documentados nas migrações anteriores (índices GIN trigram criados à
-- mão, invisíveis ao diff do Prisma).

-- User ganha grupo (anulável — sem grupo e sem isAdmin é "zero
-- permissão", estado válido) e o marcador de administrador (DEFAULT
-- false: só quem já existia antes desta migração vira admin
-- automaticamente, no backfill no fim deste arquivo).
ALTER TABLE "User" ADD COLUMN "groupId" UUID,
ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_tenantId_groupId_idx" ON "User"("tenantId", "groupId");

-- Permission: catálogo GLOBAL (sem tenantId) — corresponde 1:1 a uma
-- capacidade que existe no código (@RequirePermission(code)); um
-- tenant não inventa permissão nova, só combina as que existem dentro
-- de um Group.
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- Group: pertence ao tenant (NOT NULL) — "cada transportadora altera,
-- exclui ou duplica" exige isolamento de escrita real, diferente do
-- tenantId NULO compartilhado de QuoteStatus/DayPeriod (aquelas linhas
-- não são editadas pelo tenant; Group é).
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Group_tenantId_idx" ON "Group"("tenantId");

-- GroupPermission: join table com tenantId PRÓPRIO (redundante com
-- Group.tenantId) — mesmo critério de toda tabela filha tenant-scoped
-- nesta base (QuoteCostLine): RLS nunca é inferido por join.
CREATE TABLE "GroupPermission" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPermission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupPermission_tenantId_idx" ON "GroupPermission"("tenantId");
CREATE UNIQUE INDEX "GroupPermission_groupId_permissionId_key" ON "GroupPermission"("groupId", "permissionId");

ALTER TABLE "Group" ADD CONSTRAINT "Group_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupPermission" ADD CONSTRAINT "GroupPermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupPermission" ADD CONSTRAINT "GroupPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupPermission" ADD CONSTRAINT "GroupPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- ON DELETE SET NULL: apagar um Group (fora de escopo construir a
-- exclusão agora, mas o FK já se comporta certo quando existir) tira a
-- permissão de quem estava nele, nunca apaga o usuário.
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: Group e GroupPermission seguem o isolamento padrão por tenant
-- (D-012), mesmo mecanismo de toda tabela nova.
ALTER TABLE "Group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Group" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Group"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE "GroupPermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupPermission" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "GroupPermission"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- Permission: SEM isolamento de tenant — é catálogo de sistema, mesmo
-- tratamento de TaxRate (D-041). RLS obrigatório mesmo assim (guarda de
-- schema, D-012), política `USING (true)`. mash_app só enxerga SELECT:
-- permissão nova é migração revisada, nunca INSERT da aplicação — não
-- existe caminho de negócio que crie permissão em tempo de execução
-- (só Group/GroupPermission, que combinam as que já existem).
ALTER TABLE "Permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Permission" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Permission"
  USING (true)
  WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON "Permission" FROM mash_app;

-- Semente: só o que corresponde a um endpoint que EXISTE hoje (unidade
-- "papéis e permissões", item 2) — cotação (ver/criar/fechar/aceitar/
-- recusar), cadastro de parte e filial (ver/criar), e configuração do
-- tenant (ver/alterar — sem tela ainda, mas a permissão precisa existir
-- pra a próxima unidade nascer protegida). Código em inglês (D-007),
-- name em português (D-008).
INSERT INTO "Permission" (id, code, module, name, "createdAt", "updatedAt") VALUES
  ('00000000-0000-7000-8000-000000000301', 'quote.view',          'QUOTE',        'Ver cotação',                       now(), now()),
  ('00000000-0000-7000-8000-000000000302', 'quote.create',        'QUOTE',        'Criar cotação',                     now(), now()),
  ('00000000-0000-7000-8000-000000000303', 'quote.close',         'QUOTE',        'Fechar cotação',                    now(), now()),
  ('00000000-0000-7000-8000-000000000304', 'quote.accept',        'QUOTE',        'Aceitar cotação',                   now(), now()),
  ('00000000-0000-7000-8000-000000000305', 'quote.reject',        'QUOTE',        'Recusar cotação',                   now(), now()),
  ('00000000-0000-7000-8000-000000000306', 'registration.view',   'REGISTRATION', 'Ver cadastro (partes e filiais)',   now(), now()),
  ('00000000-0000-7000-8000-000000000307', 'registration.create', 'REGISTRATION', 'Criar cadastro (partes e filiais)', now(), now()),
  ('00000000-0000-7000-8000-000000000308', 'settings.view',       'TENANT_SETTINGS', 'Ver configuração',              now(), now()),
  ('00000000-0000-7000-8000-000000000309', 'settings.change',     'TENANT_SETTINGS', 'Alterar configuração',          now(), now());

-- Backfill de Group/GroupPermission para tenant que já existia antes
-- desta unidade: DELIBERADAMENTE NÃO está aqui. D-015 exige UUID v7
-- gerado na APLICAÇÃO, sem exceção — gen_random_uuid() no SQL geraria
-- v4, o mesmo caminho de identificador duplicado que a D-030 já
-- recusou (ali para trigger recorrente; aqui seria só um backfill
-- único, mas a regra não abre exceção por ser "só uma vez"). Em vez
-- disso: `TenantsService.ensureDefaultGroups()` (novo método,
-- reaproveitado por `create()` para tenant novo) roda uma vez contra
-- cada tenant existente via `scripts/backfill-tenant-groups.mjs`,
-- gerando os IDs em TypeScript como todo o resto do sistema já faz.
-- Relatado no fim da unidade, não escondido.

-- Backfill de User: quem já existia antes desta migração vira admin —
-- preserva o acesso que já tinha (o sistema inteiro, sem restrição
-- nenhuma) em vez de reduzi-lo silenciosamente pra zero por não ter
-- grupo. Usuário criado DEPOIS desta migração nasce com isAdmin=false
-- (DEFAULT da coluna) — "sem acesso" é o estado explícito, nunca
-- inventado.
UPDATE "User" SET "isAdmin" = true;
