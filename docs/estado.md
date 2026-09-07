# Estado da construção

Snapshot do que existe, não do plano. Contexto do projeto em `contexto.md`, decisões em
`decisoes.md`. Atualizar ao fim de cada etapa concluída — se este arquivo e o código
divergirem, o código vence, e o arquivo está desatualizado.

Atualizado em 08/09/2026, commit `5072cba` (D-033: `Party`, `CarrierProfile`,
`Vehicle.ownerPartyId`, já em `master`) + trabalho não commitado desta sessão: D-034
(`PickupOrder`, ordem de coleta em PDF), D-035 (`DocumentCounter`, numeração de
negócio aplicada a `Order` — fecha a pendência bloqueante que a D-034 tinha
registrado) e D-036 (auditoria de modelo: `RiskClearance` imutável com `result` em
enum, `CarrierPayment.netAmount` obrigatório, `CarrierHire.tollVoucher*` movido pra
`TollVoucherPurchase` — três de quatro achados; o quarto (`Order` sem status/
cancelamento) não foi endereçado, usuário pediu para não escrever ainda).

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
- Numeração de negócio (D-015/D-035): `DocumentCounter`, tabela contadora incrementada
  sob `SELECT ... FOR UPDATE` — nunca `SEQUENCE` (que não desfaz `nextval()` em
  `ROLLBACK`, abriria buraco). Chave `(tenantId, branchId, documentType, series)` —
  genérica o bastante pra CT-e/fatura reaproveitarem sem reescrita quando existirem;
  só `Order` (`documentType = 'ORDER'`) usa por ora. `TenantPrisma.transaction()`
  (novo, ao lado de `.db`) abre a transação interativa que `NumberingService.
  nextNumber()` usa — número e gravação da entidade andam na mesma transação, então
  `ROLLBACK` desfaz as duas coisas juntas. Verificado sob concorrência real (10
  criações simultâneas via `Promise.all`, contenção de lock observada de verdade via
  `pg_stat_activity`, não só resultado batendo por sorte). `transaction()` é
  primitivo de uso restrito — contorna o `forTenant()` normal, documentado em D-035
  com as três regras de uso e guarda dedicado provando que hoje não fura RLS

**Cadastro** (`Tenant`, `Branch`, `User`, `Party`, `Address`, `Driver`, `Vehicle`, `Lane`,
`CarrierProfile`)
- `User`: papéis `OPERATOR`/`MANAGER`/`FINANCE`/`ADMIN` (D-009)
- `Party`+`Address`: PF/PJ, papel é relacionamento do `Order`/`CarrierHire`, nunca campo
  do cadastro (D-018). Renomeado de `Customer` na D-033 — a mesma parte pode ser cliente
  e terceiro contratado, o nome antigo mentia; RENAME de tabela/coluna, não DROP+ADD
  (mesmo critério da D-031)
- `CarrierProfile`: 1:1 opcional com `Party` — RNTRC, categoria ANTT (`TAC`/`ETC`/`CTC`),
  vínculo (`SPOT`/`AGREGADO`); existência do perfil é o que torna a parte contratável
  (D-019/D-023, D-033). `CustomerProfile` não construído — decisão consciente, campos de
  cliente já vivem em `Party`
- `Driver`: sem login (D-009), CNH, `EMPLOYEE`/`SELF_EMPLOYED` (D-019)
- `Vehicle`: sem composição no cadastro — isso é do `Trip` (D-018). `ownerPartyId`
  anulável para `Party` (D-023/D-033) — nulo é frota própria, preenchido é de terceiro
  com proprietário nominal identificável; substituiu o enum `VehicleOwnership` (fonte
  única de verdade, um enum paralelo à FK podia divergir dela)
- `Lane`: trecho origem-destino

**Comercial** (`FreightRate`, `QuoteStatus`, `Quote`, `Order`)
- `FreightRate`: vigência com `EXCLUDE USING gist` (D-014), imutabilidade por `GRANT`
  de coluna — só `validTo`/`updatedAt` são alteráveis, `DELETE` revogado
- `Quote`: status em tabela (D-020), congela valores da `FreightRate` no fechamento
- `Order`: `branchId` obrigatório (D-011), `senderId`/`recipientId`/`tomadorId` como três
  FKs próprias pra `Party` (D-031 — só `tomador` fica em português, tem definição
  fiscal; os outros dois traduzem sem perda), congela valor nos dois caminhos de
  precificação (via `Quote` ou direto da `FreightRate`), sem nenhum `UPDATE` liberado.
  `number` (D-015/D-035): atribuído por `DocumentCounter` na mesma transação do
  `INSERT`, único em `tenantId+branchId`, nunca a PK, nunca aparece como UUID

**Operação** (`Trip`, `TripStatus`, `RiskClearance`, `Occurrence`, `OccurrenceType`)
- `Trip`: um destino por viagem (D-018), composição de veículo (`vehicleId`+
  `trailer1Id`+`trailer2Id`) pertence à viagem, não ao cadastro
- `TripStatus`: interno/público (`isPublic`, D-010) — só os dois status necessários pra
  provar a distinção estão semeados, não a taxonomia completa
- `RiskClearance`: ficha de liberação (D-023), só registro, sem integração com
  gerenciadora; `result` em `enum RiskClearanceResult` (`RECOMENDADO`/
  `NAO_RECOMENDADO`/`INEXISTENTE`/`NAO_AUTORIZADO`, D-036); imutável por inteiro —
  `UPDATE` e `DELETE` revogados do role de aplicação, sem exceção de coluna (é
  evidência de conformidade com a apólice, D-023/D-017/D-036)
- `Occurrence`/`OccurrenceType`: evento da viagem, pendurado em `Trip`; `branchId`
  obrigatório (movimento, D-011). `OccurrenceType` em tabela, não enum (D-020) — mesmo
  padrão `QuoteStatus`/`TripStatus`/`DeductionReason`. `isPublic` mora no tipo, não na
  ocorrência — espelha `TripStatus` (D-010): é o tipo que decide visibilidade, não a
  instância, senão duas ocorrências do mesmo tipo poderiam divergir por decisão de
  quem registrou. Semeados só `DELAY`/"Atraso" (público) e `COMMERCIAL_HOLD`/"Retenção
  comercial" (interno) — prova a distinção, não a taxonomia completa. Dois timestamps
  obrigatórios: `occurredAt` (fato na estrada) e `createdAt` (registro no sistema) —
  `CHECK occurredAt <= createdAt` no banco. `DELETE` revogado (alimenta o cliente pela
  D-010, apagar é pior que não ter); `UPDATE` liberado só em `description`+`updatedAt`
  (`GRANT` de coluna, mesmo mecanismo do `CarrierHire`) — tipo, viagem, filial e
  `occurredAt` congelam. Fora de escopo, não construído: ocorrência mudando status da
  viagem, anexo/foto
- `PickupOrder`/`PickupOrderItem`: ordem de coleta (D-027, D-034). Âncora é `Trip`
  (`tripId`), não `Order` direto — "dados do motorista" só existe em
  `Trip.driverId`/`vehicleId`, `orderId` chega via `trip.orderId`. Itens em tabela
  filha (não jsonb), mesmo critério de `Address`. Totais do cabeçalho (peso, volumes,
  cubagem) congelados na criação, não derivados da soma dos itens (D-014). Sem número
  de negócio sequencial próprio — não pedido; `Order` ganhou o dele na D-035
  (`DocumentCounter`), `PickupOrder` continua sem. Imutável por inteiro (`UPDATE`/
  `DELETE` revogados) — corrigir
  é emitir de novo, mesmo critério de `Order`/`CarrierHire`. PDF gerado sob demanda na
  resposta HTTP (`pdfkit`), nunca gravado em disco/storage, sem rota pública — link
  compartilhável fica reservado pra D-010

**Terceiro** (`CarrierHire`, `CarrierPayment`, `TollVoucherPurchase`, `DeductionReason`,
D-019)
- Terceiro não é cadastro próprio — reaproveita `Party` (D-018 aplicado: é uma parte
  que exerce papel), papel vive em `CarrierHire.thirdPartyId`
- `CarrierHire`: contratação 1:1 com `Trip`, só `agreedFreight` congela; CIOT
  (`ciotNumber`, só TAC) é a única coluna com `UPDATE` liberado — preenchida depois da
  contratação; `DELETE` revogado
- `TollVoucherPurchase`: tabela filha append-only, 1:N com `CarrierHire` (D-036 — antes
  três colunas mutáveis em `CarrierHire`, sem histórico, alimentando um documento fiscal
  futuro que precisa ser append-only, D-014). `tollVoucherSupplierCnpj`+
  `tollVoucherPurchaseNumber`+`tollVoucherAmount` (layout mínimo do MDF-e, ainda opcionais
  — leiaute exato não confirmado com o provedor); `UPDATE`/`DELETE` revogados por
  inteiro, correção é linha nova; resolve de graça a pendência da D-032 de mais de uma
  compra por contratação; vale-pedágio nunca entra no frete nem vira desconto do
  `CarrierPayment` (não é frete, não é base de tributo)
- `CarrierPayment`: livro de eventos append-only (`ADVANCE`/`BALANCE`/`DEDUCTION`/
  `REVERSAL`, valor sempre positivo, sinal vem do `type`) — saldo nunca é coluna, é
  `SUM` dos eventos; `UPDATE`/`DELETE` revogados por inteiro (correção é `REVERSAL`,
  linha nova); `CHECK` amarra `deductionReasonId` a `type = DEDUCTION`; `REVERSAL`
  amarrado a `reversesPaymentId` (mesmo mecanismo, índice único parcial impede estornar
  o mesmo pagamento duas vezes); `netAmount` obrigatório (D-036 — era opcional, e o
  `CHECK netAmount <= grossAmount` não pegava linha nula, deixando `SUM(netAmount)`
  subestimar o valor líquido em silêncio; sem retenção, `netAmount = grossAmount`,
  preenchido explícito)
- `DeductionReason`: motivo do desconto em tabela, não enum (D-020) — mesmo padrão
  `QuoteStatus`/`TripStatus`; semeados `DAMAGE`/`DETENTION`/`FINE`/`FUEL`
- Decisão registrada em `decisoes.md` (D-032). Dívida de nomenclatura (`Customer`
  deveria se chamar `Party`) e os campos que faltavam (RNTRC, categoria ANTT, vínculo
  agregado-vs-spot) foram corrigidos na D-033 — ver `Party`/`CarrierProfile` acima
- `CarrierPayment.reversesPaymentId`: correção do D-032 amarrando `REVERSAL` ao
  pagamento que desfaz (`CHECK` nos dois sentidos + índice único parcial contra
  estorno duplicado), migração `20260905001110_carrier_payment_reversal_link`

**Endpoints HTTP hoje:** quatro — `GET /` (público), `POST /auth/login` (público),
`GET /me/users` (protegido, exemplo mínimo de wiring), `GET /pickup-orders/:id/pdf`
(protegido, gera o PDF sob demanda — D-034). `Quote`/`Order`/`Trip` têm serviço
(`QuoteService`, `OrderService`) mas nenhum controller; `PickupOrder` tem os dois, mas
só porque gerar PDF é lógica que não dá pra testar batendo direto no banco — criação
do registro continua via Prisma direto, sem service. `NumberingService` (D-035) é
serviço sem controller nem entidade própria além de `DocumentCounter` — consumido por
`OrderModule`, pronto pra CT-e/fatura importarem.

---

## Testes: 190 passando (4 unitários + 186 e2e), zero mock de banco

Rodam contra PostgreSQL real via `docker compose up -d db` — RLS, `EXCLUDE`, `CHECK` e
`GRANT` de coluna são do banco, não dá pra confiar em mock pra isso.

| Cobertura | Onde |
|---|---|
| RLS (isolamento, falha fechada, consulta crua, escrita cruzada) | um arquivo `*-rls.e2e-spec.ts` por tabela |
| Guarda de schema (toda tabela tem RLS forçado) | `rls-schema-guard.e2e-spec.ts` |
| Login, guard, token forjado não muda o tenant usado | `auth.e2e-spec.ts` |
| Filial padrão nasce junto com o tenant | `tenant-provisioning.e2e-spec.ts` |
| `Party` não vira papel (guarda estrutural + funcional), mesma `Party` é tomador de um `Order` e terceiro de um `CarrierHire` ao mesmo tempo | `party-is-not-a-role.e2e-spec.ts` |
| `Vehicle` sem referência de composição (guarda estrutural) | `vehicle-has-no-composition.e2e-spec.ts` |
| RLS de `CarrierProfile`, 1:1 (segundo perfil pra mesma `Party` recusado), `Party` sem perfil segue contratável no banco | `carrier-profile-rls.e2e-spec.ts` |
| Veículo próprio sem `ownerPartyId`, veículo de terceiro com proprietário identificável (`Party` real, não texto livre), FK recusa `ownerPartyId` inexistente | `vehicle-owner.e2e-spec.ts` |
| Sobreposição de vigência recusada/aceita, consulta por data, imutabilidade | `freight-rate-validity.e2e-spec.ts` |
| Decimal: operador nativo concatena, `.plus()`/`.times()` somam certo | `freight-rate-decimal.spec.ts` |
| Dois caminhos de precificação, valor congelado estável, `UPDATE`/`DELETE` recusados | `order-pricing.e2e-spec.ts` |
| Tomador é FK própria, obrigatória, não computada | `order-tomador-is-own-field.e2e-spec.ts` |
| Status compartilhado (`tenantId` nulo = padrão do sistema) | `quote-status-rls.e2e-spec.ts` |
| Composição de veículo (cavalo+2 carretas, truck sozinho, `CHECK` recusando inválido) | `trip-composition.e2e-spec.ts` |
| Status interno não aparece em consulta filtrada por `isPublic` | `trip-status-visibility.e2e-spec.ts` |
| Contratação congela `agreedFreight`, libera só CIOT, `DELETE` recusado | `carrier-hire-ledger.e2e-spec.ts` |
| RLS de `TollVoucherPurchase`, formato de CNPJ, valor positivo | `toll-voucher-purchase-rls.e2e-spec.ts` |
| Vale-pedágio como compra separada — mais de uma compra na mesma contratação (1:N), `UPDATE`/`DELETE` recusados (D-036) | `carrier-hire-ledger.e2e-spec.ts` |
| Livro de pagamento append-only, `CHECK` motivo↔`DEDUCTION`, saldo por soma de eventos, vale-pedágio não entra na conta | `carrier-hire-ledger.e2e-spec.ts` |
| Estorno amarrado a `reversesPaymentId` (`CHECK`, sem duplo estorno), `netAmount <= grossAmount`, `netAmount` obrigatório (`INSERT` cru sem a coluna recusado, não só o tipo do Prisma Client), soma bate com e sem retenção (D-036) | `carrier-hire-ledger.e2e-spec.ts` |
| `RiskClearance` imutável por inteiro — `UPDATE` de `result`/`checkDate`/`validUntil` recusado, além do `DELETE` já coberto (D-023/D-017/D-036) | `risk-clearance-rls.e2e-spec.ts` |
| `OccurrenceType` compartilhado (`tenantId` nulo visível a todos) | `occurrence-type-rls.e2e-spec.ts` |
| RLS de `Occurrence`, `CHECK occurredAt<=createdAt`, `UPDATE` restrito a `description`, `DELETE` recusado, tipo interno não aparece em consulta filtrada por `isPublic` | `occurrence.e2e-spec.ts` |
| RLS de `PickupOrder` | `pickup-order-rls.e2e-spec.ts` |
| RLS de `PickupOrderItem` | `pickup-order-item-rls.e2e-spec.ts` |
| PDF real (não mock): 1 item cabe em 1 página; 40 itens produzem mais de uma página sem sobrepor nem cortar texto, todos os 40 presentes no texto extraído de volta com `pdf-parse`, cabeçalho "(continuação)" bate com o total de páginas menos uma; `UPDATE`/`DELETE` recusados em `PickupOrder` e `PickupOrderItem` | `pickup-order-pdf.e2e-spec.ts` |
| Rota `GET /pickup-orders/:id/pdf` ponta a ponta (sem token → 401, com token → PDF com `Content-Type` correto, token de outro tenant não vaza PDF alheio) | `pickup-order-http.e2e-spec.ts` |
| RLS de `DocumentCounter` | `document-counter-rls.e2e-spec.ts` |
| Numeração (D-015): sequencial em criações sucessivas; unicidade de `(tenantId, branchId, number)` garantida no banco; `DocumentCounter` libera só `UPDATE` de `lastNumber`, `DELETE` recusado; rollback depois de pegar o número não desperdiça o número (reaproveitado na próxima criação real); **concorrência real** — 10 criações simultâneas via `Promise.all` produzem 10 números distintos sem buraco, com contenção de lock observada de verdade em `pg_stat_activity` (não só resultado correto por acaso) | `order-numbering.e2e-spec.ts` |
| Guarda: `TenantPrisma.transaction()` continua protegido por RLS (D-012, D-035) — leitura via `tx.<model>` e via `tx.$queryRaw` não vazam tenant, escrita no tenant alheio recusada, duas `transaction()` concorrentes de tenants diferentes não se misturam, e o contexto de tenant não vaza pra próxima conexão do pool depois que a transação termina | `tenant-prisma-transaction-rls.e2e-spec.ts` |

Comando: `npm run test:e2e` (unitário: `npm test`), dentro de `backend/`.

---

## Em andamento

D-036 (auditoria de modelo) parcial: três de quatro achados corrigidos (`RiskClearance`
imutável, `CarrierPayment.netAmount` obrigatório, `CarrierHire.tollVoucher*` movido pra
`TollVoucherPurchase`), nada commitado ainda. Falta um:

- `Order` sem status/cancelamento — usuário pediu para não escrever ainda, decisão em
  aberto

---

## Próximo

Dentro do escopo v1 (D-028), ainda faltam:

- CT-e e MDF-e — emissão via provedor (D-006), importação de XML de NF-e (D-024)
- Averbação (D-023) — depende de saber se a AT&M tem API (pendência bloqueante em
  `decisoes.md`)
- Fatura, contas a receber (D-025) — pagamento a terceiro já modelado (`CarrierHire`/
  `CarrierPayment`, D-019), falta serviço/controller
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
- **`npm install pdfkit` (D-034) também exigiu `--legacy-peer-deps`.** Mesma família de
  problema do item `nestjs-cls` abaixo, não um conflito novo do pdfkit em si: o `npm
  install` puro falha com `ERESOLVE` porque `nestjs-cls@6.2.2` declara peer
  `@nestjs/common`/`@nestjs/core` `>= 10 < 12` e o projeto está em `@nestjs/common@12` —
  qualquer `npm install` que precise re-resolver a árvore de dependências esbarra nisso,
  não só a instalação inicial. Confirma que **todo `npm install`/`npm ci` futuro no
  projeto precisa de `--legacy-peer-deps`** enquanto o `nestjs-cls` não publicar suporte
  a Nest 12 (ou o Nest não for rebaixado) — isso inclui o `npm ci` de deploy (D-005):
  se a plataforma gerenciada rodar `npm ci` sem essa flag, o build de produção quebra
  no mesmo `ERESOLVE`. Ainda não verificado se o `npm ci` do pipeline de deploy já
  passa essa flag — ação pendente antes do primeiro deploy real.
- **Vulnerabilidades do `npm audit`: decisão registrada, aceitas por ora.** Avaliação
  anterior nesta sessão: transitivas do CLI do Prisma (`mysql2`/`deepmerge-ts`),
  dev-only, não entram no `dist/` do build. Revisitar quando o Prisma atualizar. **Não
  reverificado após a reinstalação de hoje** — o `npm audit` foi cancelado por timeout
  de rede contra o registry; os números da última verificação real não foram
  confirmados de novo nesta sessão.
- **`nestjs-cls@6.2.2` não declara suporte a NestJS 12.** Peer declarado é
  `@nestjs/common`/`@nestjs/core` `>= 10 < 12`; confirmado via `npm view nestjs-cls
  peerDependencies` que é a versão mais recente publicada, sem release compatível
  disponível. `npm install` puro falha com `ERESOLVE`. `package-lock.json` já registrava
  essa combinação (nestjs-cls 6.2.2 + Nest 12.0.1) antes da perda do `.git`, sem
  `.npmrc`/`overrides` no repo que explique como — a instalação original deve ter usado
  `--legacy-peer-deps` ou `--force` sem registro. **Reinstalação desta sessão usou
  `npm install --legacy-peer-deps`** (confirmado com o usuário antes de aplicar); as duas
  suítes passaram depois (97 testes, incluindo os `*-rls.e2e-spec.ts` que exercitam
  `ClsService`/`TenantPrisma`), o que dá evidência funcional — mas o peer em si continua
  não declarado como compatível rio acima. Revisitar se o Nest for atualizado de novo ou
  se o `nestjs-cls` publicar suporte a v12.
- **`.env` não está no repositório** (correto — é `.gitignore`d), só `.env.example`.
  Precisa ser copiado manualmente (`cp .env.example .env`) antes de `prisma generate` ou
  dos testes; os valores são dev-only e já coincidem com `docker-compose.yml`.
- **Volume do Postgres local não sobrevive à perda do `.git`** (é local, fora do
  controle de versão). Banco novo exige `npx prisma migrate deploy` (22 migrações) antes
  da suíte e2e — sem isso os testes falham por schema ausente, não por RLS.
- **`pdfkit`/`pdf-parse` instalados nesta sessão** (D-034) — mesmo `--legacy-peer-deps`
  do `nestjs-cls`, nenhuma vulnerabilidade nova no `npm audit` (as 4 de alta severidade
  continuam as mesmas do CLI do Prisma, já registradas acima). `@types/pdf-parse` foi
  instalado por engano (a v2 do `pdf-parse` é reescrita como classe e publica os
  próprios `.d.ts`; o pacote de tipos era pra API antiga da v1) e removido no mesmo
  passo — não sobrou no `package.json`.
