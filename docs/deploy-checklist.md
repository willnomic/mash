# Checklist de deploy

Itens que só aparecem em produção — nunca apareceram em dev local porque o ambiente
local (Docker, `docker-compose.yml`) tem privilégio ou configuração que a plataforma
gerenciada (Railway ou Render, D-005) pode não ter. Cada item tem a origem de onde foi
identificado, para não virar afirmação solta.

Preencher a coluna de resultado só depois de checar de verdade contra a plataforma —
nada aqui foi verificado em produção ainda.

---

## Antes do primeiro deploy

- [ ] **`CREATE EXTENSION btree_gist` sem superuser.**
      A migração `20260904073246_add_lane_freight_rate` roda `CREATE EXTENSION IF NOT
      EXISTS btree_gist` (necessária para o `EXCLUDE USING gist` de `FreightRate`,
      D-014). Verificado nesta sessão que `mash_owner` é superuser no Postgres local
      (o Docker cria o `POSTGRES_USER` como superuser por padrão) — **não verificado**
      se o role de dono entregue por Railway/Render tem privilégio para instalar
      extensão. A maioria das plataformas gerenciadas permite extensões "trusted"
      (btree_gist é uma delas) para o dono do banco sem superuser pleno, mas isso não
      foi confirmado contra a plataforma real escolhida — checar antes de rodar
      `prisma migrate deploy` em produção. Se não for permitido, a migração falha no
      meio, com as tabelas anteriores já criadas — não é reversível sem intervenção.

- [ ] **`CREATE EXTENSION pg_trgm` sem superuser.**
      A migração `20260908050000_add_order_status_and_customer_reference` roda `CREATE
      EXTENSION IF NOT EXISTS pg_trgm` (índice GIN trigram para busca por
      `Order.customerReference`, D-038). Mesma categoria de risco já registrada para
      `btree_gist` acima — `pg_trgm` também costuma ser "trusted" nas plataformas
      gerenciadas mais comuns, mas isso não foi confirmado contra Railway/Render de
      verdade. Checar junto com o item do `btree_gist`, na mesma verificação.

- [ ] **Versão do Node exigida pelo `@angular-devkit` (dependência do `@nestjs/cli`).**
      `npm install` no `backend/` emite `EBADENGINE`: `@angular-devkit/core`,
      `@angular-devkit/schematics` e `@angular-devkit/schematics-cli` exigem
      `node ^22.22.3 || ^24.15.0 || >=26.0.0`. **Corrigido 08/09/2026 (D-041) — texto
      desatualizado desde a sessão da D-038**: a máquina de desenvolvimento está em
      `v24.20.0` (dentro da faixa 24.x, o aviso não dispara mais localmente), não mais
      `v22.20.0` como este item dizia. O item em si continua de pé: não verificado se
      a versão de Node da *plataforma de deploy* está dentro de alguma das três faixas
      aceitas — confirmar antes do primeiro build, e alinhar (`engines` no
      `package.json`, ou variável de versão do Node na plataforma).

- [ ] **As duas URLs de banco, como segredos separados na plataforma.**
      `DATABASE_URL` (dono — só `prisma migrate deploy`, nunca a aplicação em runtime)
      e `DATABASE_URL_APP` (role `mash_app`, sem posse de tabela — usado por
      `backend/src/prisma/prisma-tenant.ts` em toda consulta). Confundir as duas
      credenciais desliga o RLS silenciosamente (D-012, armadilha 1: o dono da tabela
      ignora a política). Configurar como dois secrets distintos na plataforma, nunca
      um só reaproveitado para os dois papéis.

- [ ] **`npm install`/`npm ci` exige `--legacy-peer-deps`.**
      `nestjs-cls@6.2.2` (versão mais recente publicada — confirmado via `npm view
      nestjs-cls versions/peerDependencies` nesta sessão) declara peer
      `@nestjs/common`/`@nestjs/core` `>= 10 < 12`; o projeto usa Nest 12.0.1. Instalação
      sem a flag falha com `ERESOLVE`. Verificado localmente: `npm install
      --legacy-peer-deps` resolve para a mesma árvore já travada em
      `package-lock.json`, e as duas suítes (97 testes) passam depois. Se o passo de
      build da plataforma de deploy rodar `npm ci`/`npm install` sem essa flag, vai
      bater no mesmo erro — confirmar que o comando de build da plataforma inclui
      `--legacy-peer-deps`, ou configurar via variável/arquivo equivalente. Não há
      release do `nestjs-cls` com suporte declarado a Nest 12 até o momento desta
      verificação; revisitar se isso mudar.

- [ ] **Role `mash_app` criado manualmente, fora de qualquer migração.**
      `docker/init-db.sql` cria o role `mash_app` só no ambiente local (roda uma vez,
      na criação do container). Em produção isso **não acontece sozinho** — é passo
      manual, documentado em `docs/d012-multi-tenant-rls.md` (Passo 1), a ser feito
      uma vez contra o banco gerenciado antes do primeiro `prisma migrate deploy`.
      **Ordem importa:** várias migrações têm `GRANT`/`REVOKE ... TO/FROM mash_app`
      (ex.: `20260904004121_init_tenant`, `20260904073246_add_lane_freight_rate`,
      `20260904073936_revoke_freight_rate_delete`) — se o role não existir ainda
      quando essas migrações rodarem, elas falham. Criar o role é *pré-requisito* do
      primeiro deploy, não um passo qualquer da lista.

---

## Não coberto por este checklist

Este documento junta só os itens já encontrados construindo o backend até aqui — não é
um checklist geral de deploy (SSL do banco, backup, monitoramento, variáveis de
ambiente de terceiros como o provedor fiscal de D-006, etc.). Completar conforme
aparecer, com a mesma disciplina: item aqui só depois de identificado de verdade, não
antecipado de memória.
