# Estado da construção

Snapshot do que existe, não do plano. Contexto do projeto em `contexto.md`, decisões em
`decisoes.md`. Atualizar ao fim de cada etapa concluída — se este arquivo e o código
divergirem, o código vence, e o arquivo está desatualizado.

Atualizado em 04/09/2026, commit `5f7c0d2`.

---

## Construído, com teste passando

Só backend (`backend/`). Nenhuma tela existe ainda.

**Infraestrutura**
- Multi-tenant por RLS (D-012): dois roles de banco (`mash_owner`/`mash_app`), `forTenant()`,
  guarda de schema testando que toda tabela tem RLS forçado
- Login por slug+e-mail+senha (D-029), JWT com `tenantId`+`role`, `TenantGuard` global,
  `ClsService`/`TenantPrisma` (D-012 Passo 4)
- `Tenant` nasce com filial padrão numa transação só (`TenantsService`, D-011/D-030 — não
  por trigger, preserva D-015)

**Cadastro** (`Tenant`, `Branch`, `User`, `Customer`, `Address`, `Driver`, `Vehicle`, `Lane`)
- `User`: papéis `OPERATOR`/`MANAGER`/`FINANCE`/`ADMIN` (D-009)
- `Customer`+`Address`: PF/PJ, papel é relacionamento do `Order`, nunca campo do cadastro
  (D-018)
- `Driver`: sem login (D-009), CNH, `EMPLOYEE`/`SELF_EMPLOYED` (D-019)
- `Vehicle`: sem composição no cadastro — isso é do `Trip` (D-018)
- `Lane`: trecho origem-destino

**Comercial** (`FreightRate`, `QuoteStatus`, `Quote`, `Order`)
- `FreightRate`: vigência com `EXCLUDE USING gist` (D-014), imutabilidade por `GRANT`
  de coluna — só `validTo`/`updatedAt` são alteráveis, `DELETE` revogado
- `Quote`: status em tabela (D-020), congela valores da `FreightRate` no fechamento
- `Order`: `branchId` obrigatório (D-011), `senderId`/`recipientId`/`tomadorId` como três
  FKs próprias pro `Customer` (D-031 — só `tomador` fica em português, tem definição
  fiscal; os outros dois traduzem sem perda), congela valor nos dois caminhos de
  precificação (via `Quote` ou direto da `FreightRate`), sem nenhum `UPDATE` liberado

**Operação** (`Trip`, `TripStatus`, `RiskClearance`)
- `Trip`: um destino por viagem (D-018), composição de veículo (`vehicleId`+
  `trailer1Id`+`trailer2Id`) pertence à viagem, não ao cadastro
- `TripStatus`: interno/público (`isPublic`, D-010) — só os dois status necessários pra
  provar a distinção estão semeados, não a taxonomia completa
- `RiskClearance`: ficha de liberação (D-023), só registro, sem integração com
  gerenciadora; `DELETE` revogado (é evidência de conformidade)

**Endpoints HTTP hoje:** só três — `GET /` (público), `POST /auth/login` (público),
`GET /me/users` (protegido, exemplo mínimo de wiring). `Quote`/`Order`/`Trip` têm
serviço (`QuoteService`, `OrderService`) mas nenhum controller.

---

## Testes: 97 passando (4 unitários + 93 e2e), zero mock de banco

Rodam contra PostgreSQL real via `docker compose up -d db` — RLS, `EXCLUDE`, `CHECK` e
`GRANT` de coluna são do banco, não dá pra confiar em mock pra isso.

| Cobertura | Onde |
|---|---|
| RLS (isolamento, falha fechada, consulta crua, escrita cruzada) | um arquivo `*-rls.e2e-spec.ts` por tabela |
| Guarda de schema (toda tabela tem RLS forçado) | `rls-schema-guard.e2e-spec.ts` |
| Login, guard, token forjado não muda o tenant usado | `auth.e2e-spec.ts` |
| Filial padrão nasce junto com o tenant | `tenant-provisioning.e2e-spec.ts` |
| `Customer` não vira papel (guarda estrutural + funcional) | `customer-is-not-a-role.e2e-spec.ts` |
| `Vehicle` sem referência de composição (guarda estrutural) | `vehicle-has-no-composition.e2e-spec.ts` |
| Sobreposição de vigência recusada/aceita, consulta por data, imutabilidade | `freight-rate-validity.e2e-spec.ts` |
| Decimal: operador nativo concatena, `.plus()`/`.times()` somam certo | `freight-rate-decimal.spec.ts` |
| Dois caminhos de precificação, valor congelado estável, `UPDATE`/`DELETE` recusados | `order-pricing.e2e-spec.ts` |
| Tomador é FK própria, obrigatória, não computada | `order-tomador-is-own-field.e2e-spec.ts` |
| Status compartilhado (`tenantId` nulo = padrão do sistema) | `quote-status-rls.e2e-spec.ts` |
| Composição de veículo (cavalo+2 carretas, truck sozinho, `CHECK` recusando inválido) | `trip-composition.e2e-spec.ts` |
| Status interno não aparece em consulta filtrada por `isPublic` | `trip-status-visibility.e2e-spec.ts` |

Comando: `npm run test:e2e` (unitário: `npm test`), dentro de `backend/`.

---

## Em andamento

Nada no momento — última unidade concluída foi `Trip`/`TripStatus`/`RiskClearance`
(commit `5f7c0d2`).

---

## Próximo

Dentro do escopo v1 (D-028), ainda faltam:

- Terceiro/agregado como cadastro próprio (TAC/ETC) — hoje só `Driver.employmentType` e
  `Vehicle.ownership` existem; contratação da viagem com terceiro (D-019) não tem modelo
- Ordem de coleta em PDF (D-027)
- Ocorrência da viagem (`Occurrence`, mencionada em D-018 mas não construída)
- CT-e e MDF-e — emissão via provedor (D-006), importação de XML de NF-e (D-024)
- Averbação (D-023) — depende de saber se a AT&M tem API (pendência bloqueante em
  `decisoes.md`)
- Fatura, contas a receber, pagamento a terceiro (D-025, D-019)
- Qualquer frontend — zero tela construída até aqui

---

## Pendências técnicas conhecidas

- **`docs/deploy-checklist.md`** — 4 itens abertos, nenhum verificado contra a
  plataforma de produção: `CREATE EXTENSION btree_gist` sem superuser, versão de Node
  da plataforma, as duas URLs de banco como segredos separados, role `mash_app` criado
  manualmente antes do primeiro `prisma migrate deploy`.
- **Versão do Node mudou durante a sessão.** A máquina de desenvolvimento está em
  `v24.20.0` agora (era `v22.20.0` quando o `deploy-checklist.md` foi escrito) — o aviso
  `EBADENGINE` do `@angular-devkit` não dispara mais localmente, verificado com
  reinstalação limpa. O texto do `deploy-checklist.md` ainda cita a versão antiga —
  **desatualizado, não corrigido** (fora do escopo desta tarefa). O item em si (confirmar
  a versão de Node da *plataforma de deploy*) continua de pé.
- **npm 11 bloqueia script de instalação por padrão.** A mesma reinstalação limpa
  emitiu aviso pra `@prisma/engines`, `argon2` e `prisma` (scripts não cobertos por
  `allowScripts`). Verificado que não quebrou nada — build, `prisma generate` e as duas
  suítes de teste passaram normalmente — mas não investigado a fundo; pode importar pra
  CI/deploy se a plataforma usar `npm ci` com esse comportamento.
- **Vulnerabilidades do `npm audit`: decisão registrada, aceitas por ora.** Avaliação
  anterior nesta sessão: transitivas do CLI do Prisma (`mysql2`/`deepmerge-ts`),
  dev-only, não entram no `dist/` do build. Revisitar quando o Prisma atualizar. **Não
  reverificado após a reinstalação de hoje** — o `npm audit` foi cancelado por timeout
  de rede contra o registry; os números da última verificação real não foram
  confirmados de novo nesta sessão.
