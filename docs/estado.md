# Estado da construção

Snapshot do que existe, não do plano. Contexto do projeto em `contexto.md`, decisões em
`decisoes.md`. Atualizar ao fim de cada etapa concluída — se este arquivo e o código
divergirem, o código vence, e o arquivo está desatualizado.

Atualizado em 10/09/2026, commit `88f1d9f` (D-034 a D-044 já em `master`, avaliação MDF-e
concluída) + trabalho desta sessão: repositório reestruturado em npm workspaces
(`backend`/`frontend`/`shared` — `frontend` só declarado, ainda não existe) e criado
`shared/` (`@mash/shared`), pacote TypeScript puro sem NestJS/React/Prisma, com o
primeiro tipo de domínio compartilhado: `TimeWindow` (janela de tempo em linguagem
natural, pendência técnica registrada em `decisoes.md`) — `parseTimeWindow`,
`formatTimeWindow`, `precisionOf`, `validateTimeWindow`. Parser verificado contra a
planilha operacional real de 2025 (1.453 formas distintas) — nove códigos de período
confirmados, busca de horário em qualquer posição da string, tolerância a erro de
digitação, e um conjunto de 31 formas deliberadamente fora de escopo (ordem de perna,
dependência de evento, regra de endereço, data alternativa), com duas pendências novas
registradas em `decisoes.md` por causa disso (`Address` sem horário de funcionamento;
ordem de perna usando a coluna de data por falta de lugar). Nenhuma mudança de schema;
nenhum model do Prisma ainda usa o tipo (é essa a unidade seguinte). Detalhe em
"`@mash/shared`" abaixo.

---

## Construído, com teste passando

Backend (`backend/`) e o pacote compartilhado (`shared/`, `@mash/shared`). Nenhuma tela
existe ainda — `frontend/` só está declarado no `workspaces` da raiz.

**Repositório: npm workspaces**
- Raiz ganhou `package.json` (`workspaces: ["backend", "frontend", "shared"]`) e `.npmrc`
  com `legacy-peer-deps=true` — sem isso, `npm install` na raiz quebra com `ERESOLVE`
  (`nestjs-cls@6.2.2` declara peer `@nestjs/common`/`@nestjs/core >=10 <12`, o projeto
  está em `^12.0.1`; mesmo problema já documentado abaixo, "Pendências técnicas"). Um só
  `package-lock.json` agora na raiz — o de `backend/` foi removido, não existe mais lock
  por workspace individual.
- `backend/package.json` ganhou a dependência `"@mash/shared": "*"` (protocolo de
  workspace do npm — sempre resolve pro pacote local, nunca busca no registry). Prova de
  fiação: `backend/src/shared-workspace-import.spec.ts` importa e usa
  `parseTimeWindow`/`formatTimeWindow`/`precisionOf` de `@mash/shared` — não é lógica de
  negócio do backend, só confirma que a resolução via workspace funciona (`npm test` e
  `npm run build` do backend, os dois verificados depois da reestruturação).
- Mesmo comportamento do `npm 11` já registrado em "Pendências técnicas conhecidas"
  (install-scripts bloqueados) reconfirmado com `npm install` rodando na RAIZ em vez de
  `backend/`: `npx prisma generate` teve que ser rodado à mão dentro de `backend/` depois
  do install (sem isso, `@prisma/client` fica sem o client gerado — `P2025` nos testes).
  `argon2` funcionou sem rebuild — prebuild `win32-x64` já embutido no pacote, carregado
  em tempo de `require`, não no install.

**`@mash/shared`** (`shared/`) — pacote TypeScript puro, sem NestJS/React/Prisma como
dependência (`shared/package.json`), buildado com `tsc` (`npm run build`, também roda
sozinho no `prepare` do `npm install`, então o consumidor não precisa lembrar de buildar
à mão).
- `time-window/` — primeiro tipo do pacote, para a pendência técnica "janela de tempo em
  linguagem natural" (`decisoes.md`). `TimeWindow` (`date`/`startTime`/`endTime`/
  `endsNextDay`/`dayPeriodCode`/`note`), com invariantes validadas por
  `validateTimeWindow` (nunca lança — devolve lista de violações) e precisão sempre
  DERIVADA (nunca armazenada) por `precisionOf`: `EXACT`/`RANGE`/`UNTIL`/`FROM`/`PERIOD`/
  `DAY`.
- `parseTimeWindow(input, referenceYear)` — nunca lança; o que não reconhece vai inteiro
  pra `note`, com `date` preenchida quando reconhecível. Busca hora/faixa em QUALQUER
  posição da string (não só logo após a data), com tolerância a erro de digitação
  confirmado em dado real (pontuação sobrando, "A PARTIR DA" sem S, conector "A" grudado
  no horário, dígito separado por espaço, "MIEO"/"PRMEIRA"). Também reconhece a própria
  saída de `formatTimeWindow` (necessário pro teste de ida e volta).
- **Quando horário explícito e período nomeado aparecem na mesma célula, o horário
  ganha** (ex. "FINAL DA TARDE APÓS AS 18H00" → `startTime: "18:00"`, não
  `dayPeriodCode`). A invariante que proíbe os dois juntos não muda — quem resolve o
  conflito é o parser: `dayPeriodCode` fica nulo, os campos de horário são preenchidos, e
  a célula original inteira vai pra `note` (estruturação PARCIAL, diferente de fallback
  total — `note` preenchido não significa mais "nada foi reconhecido"). Mesma regra
  resolve mês implausível com hora presente (`"11/00 - 09H00"` → `date: ''`, horário
  extraído, string inteira em `note`) e string sem data nenhuma
  (`"(RECEBIMENTO DAS 07H00 A 17H00)"` → mesma lógica, sem prefixo de data pra achar).
- **Nove códigos de período, todos confirmados em dado real** (planilha operacional de
  2025, 1.951 células / 1.453 formas distintas — contagens sobre as células originais,
  não sobre as formas deduplicadas do fixture): `MORNING` ("pela manhã"/"pela manha"/"de
  manha", 35), `AFTERNOON` ("pela tarde", 37), `EVENING` ("pela noite"/"a noite", 2),
  `FIRST_HOUR` ("primeira hora da manhã", 13 — sinônimos "primeira hora"/"primeira hora
  do dia"), `END_OF_DAY` ("final da tarde", 3 — sinônimo "fim de tarde"), `MIDDAY` ("meio
  dia", 5), `LATE_MORNING` ("final da manhã", 2 — novo), `EARLY_AFTERNOON` ("início da
  tarde"/"primeira hora da tarde", 2 — novo), `ALL_DAY` ("recebe o dia inteiro", 1 —
  novo). "Até o meio dia" vira horário (`endTime: "12:00"`), não o período `MIDDAY` —
  confirmado em dado real (`"15/10 - ATE O MEIO DIA"`).
- `formatTimeWindow(window, dayPeriodLabel?)` — saída em português (D-008). Não guarda
  tradução de período: quem chama passa o rótulo (vem da tabela de domínio, unidade
  seguinte); sem rótulo, cai no próprio código como texto degradado.
- **Fixture real recebida e verificada** — `time-window/__fixtures__/janelas-planilha-pedro-2025.json`
  (1.453 formas distintas, 1.951 células originais, extraídas das colunas DATA DE
  COLETA/ENTREGA/DEVOLUÇÃO de uma planilha operacional real de 2025 — dado anterior ao
  modelo, não gerado por nós). `time-window.fixture.spec.ts` não usa mais taxa
  percentual: declara o CONJUNTO EXATO de 31 formas que devem cair em fallback total
  (nada estruturado além, possivelmente, da data) e falha se o conjunto real divergir em
  qualquer direção — algo novo caindo em fallback, ou algo da lista deixando de cair
  (regra nova engoliu o que era pra ficar de fora). As 31 se dividem em quatro categorias
  de negócio, documentadas tanto no teste quanto no comentário acima de
  `parseTimeWindow` em `time-window.parser.ts`: ordem da perna dentro do pedido
  (`Trip.sequence`, D-037 — 17 formas, ex. "PRIMEIRA DE QUINTA", "12/03 - TERCEIRO"),
  dependência de evento/status de viagem, não horário (9 formas, ex. "LOGO APÓS A
  DESCARGA", "LIBERADO"), regra de horário de funcionamento do `Address`, não da carga (1
  forma: "ORDEM DE CHEGADA"), e data alternativa — decisão deliberada de não modelar (4
  formas, ex. "05/03 OU 06/03": ancora na primeira data, string inteira em `note`). As
  duas primeiras categorias geraram pendências novas em `decisoes.md` (`Address` sem
  horário de funcionamento; ordem de perna registrada hoje na coluna de data por falta de
  lugar). Distribuição final: `EXACT` 574, `RANGE` 550, `UNTIL` 191, `FROM` 16, `PERIOD`
  71, `DAY` 51 (mais 32 formas estruturadas parcialmente, com `note` preenchido junto).
  Todos os 65 testes do pacote passam.
- **Ligado ao schema em D-045** (`DayPeriod` + colunas estruturadas em `PickupOrder`,
  `pickupWindow` renomeado pra `pickupTimeNote`) — detalhe completo na entrada
  `PickupOrder`/`PickupOrderItem`, mais abaixo.

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
- `Tenant` ganhou três colunas de regime tributário (D-043, consulta contábil) — todas
  nullable, nenhuma lida por lógica de negócio ainda ("reserva o assento, não constrói o
  fluxo"): `incomeTaxRegime` (`enum IncomeTaxRegime` — `SIMPLES_NACIONAL`/
  `LUCRO_PRESUMIDO`/`LUCRO_REAL`, fixo por lei), `isSimplesIcmsContributor` (indicador
  separado do CST — não existe CSOSN em CT-e), `ibsCbsApurationRegime` (string livre,
  não enum — decisão pedida ao usuário: não fechar lista de regimes de apuração ainda
  incompleta, ex. "Simples Híbrido" da LC 214/2025 a partir de 2027)
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

**Comercial** (`FreightRate`, `QuoteStatus`, `Quote`, `QuoteCostType`, `QuoteCostLine`,
`TaxRate`, `IbsCbsTaxSituation`, `OrderStatus`, `Order`)
- `FreightRate`: vigência com `EXCLUDE USING gist` (D-014), imutabilidade por `GRANT`
  de coluna — só `validTo`/`updatedAt` são alteráveis, `DELETE` revogado
- `Quote`: status em tabela (D-020). Dois caminhos mutuamente exclusivos (D-041, `CHECK`
  no banco): **TABELA** (existente) — `freightRateId` preenchido, congela valores da
  `FreightRate` no `INSERT`; **CUSTO** (D-041, validação de campo — dor nº 1 do
  operador é "cálculo de tudo, margem, imposto") — `freightRateId` nulo,
  `marginPercentage`+`icmsUf` na criação, `QuoteCostLine` filhas, preço só existe
  depois de `close()`. `close()` no caminho custo: soma as linhas, lê `TaxRate` vigente
  na data do fechamento, recompõe imposto em **duas etapas** (correção 08/09/2026 — a
  versão original tratava ICMS+IBS+CBS como pool único, errado: IBS/CBS não entram na
  própria base): etapa 1, ICMS por dentro (`custo ÷ (1−icms)`); etapa 2, IBS/CBS **sempre
  calculados**, mas só somados ao preço quando `TaxRate.composesPrice` da linha vigente
  é `true` (correção D-043 — durante a calibragem de 2026 é `false`: IBS/CBS aparecem
  destacados no documento mas não entram na cobrança; ICMS/ISS seguem dedutíveis da
  própria base de IBS/CBS até 2032, consulta contábil). Margem (etapa 3) por
  dentro — **implementação atual, não confirmada em campo** (`QuotePricingCalculator`,
  `src/quote/quote-pricing-calculator.ts`, função pura testada por unitário; pendência
  de validação com o sócio em `decisoes.md`). Congela
  `icmsRateApplied`/`ibsRateApplied`/`cbsRateApplied`/`total` via `GRANT` de coluna.
  `OrderService` só sabe consumir o caminho TABELA — guarda explícita, caminho CUSTO→
  `Order` não construído nesta unidade. Caminho TABELA (`FreightRate`) nunca chamou
  `QuotePricingCalculator` — gross-up só serve pra recompor de um custo, nunca pra
  destacar tributo sobre um valor já acordado; essa segunda operação (multiplicação
  simples, preço não muda) tem função própria e deliberadamente não ligada a nenhum
  caminho de produção, `calculateTaxOnAgreedValue`
  (`src/tax-rate/tax-composition-calculator.ts`, D-043)
- `QuoteCostType`: domínio, `tenantId` nulo = padrão (mesmo padrão `DeductionReason`);
  semeados `FREIGHT`/`TOLL`/`FUEL`/`INSURANCE`/`FEES`
- `QuoteCostLine`: filha de `Quote` (só caminho CUSTO), imutável por inteiro desde a
  criação (mesmo critério `PickupOrderItem`/`CarrierPayment`) — "congela no fechamento"
  fica satisfeito de graça, nunca foi editável. Cobre o lado do CUSTO — falta o lado do
  PREÇO decomposto (CT-e exige `valoresPrestacao.componentes`, não construído, só
  registrado em `decisoes.md` D-041)
- `TaxRate` (D-041, ampliado em D-043): alíquota com vigência, mesmo mecanismo do
  `FreightRate`. **Sem `tenantId`** — é lei, não configuração de tenant (D-020 não se
  aplica); RLS `USING (true)` (mesmo mecanismo do `Tenant.slug`, D-029, os dois tratados
  explicitamente — com o motivo escrito — no guarda de schema de RLS,
  `rls-schema-guard.e2e-spec.ts`), `mash_app` só tem `SELECT`. `isPlaceholder`
  (correção 08/09/2026): marca as 27 linhas de ICMS **interna** como placeholder;
  `TaxRateService.findRate()` recusa devolvê-las fora de `NODE_ENV`
  `development`/`test` (falha fechada — vazio/ausente também recusa) — não é comentário
  segurando, é recusa em código. **`icmsOperationType`** (`enum IcmsOperationType`,
  D-043) substitui "ICMS = por UF" por três casos, sem matriz 27×27: `INTERNA` (mesma
  UF origem/destino, exige `uf`, placeholder) — `INTERESTADUAL_7`/`INTERESTADUAL_12`
  (`uf` nulo, regra da Resolução do Senado: 7% quando origem é Sul/Sudeste exceto ES E
  destino é Norte/Nordeste/Centro-Oeste/ES, 12% no resto — testada por pertencimento a
  um `Set` de UF em `TaxRateService.findInterstateIcmsRate()`, não indexada numa tabela
  27×27; as duas linhas nascem `isPlaceholder=false`, dado real da consulta) —
  intramunicipal (mesmo município, sem ICMS: não é linha de `TaxRate`, é a constante
  `ICMS_INTRAMUNICIPAL_RATE = 0`). **`composesPrice`** (`Boolean @default(true)`,
  D-043): se a linha soma ao preço do cliente é parâmetro com vigência, não constante —
  as linhas de IBS/CBS nascem `false` (correção do erro da D-041, ver acima).
  `EXCLUDE USING gist` particionado por `taxType`+`icmsOperationType`+`coalesce(uf,'')`
  (o `coalesce(icmsOperationType::text,'')` quebrava com erro de IMMUTABLE em índice
  funcional — resolvido com `CASE` literal em vez de cast, D-043), `CHECK`s amarram
  taxType↔icmsOperationType e icmsOperationType↔uf (o segundo teve um bug de lógica de
  três valores do SQL — `NULL OR FALSE` não é violação pro Postgres — achado por teste e
  corrigido antes de commitar, D-043). Semeado: IBS 0,1%/CBS 0,9% (LC 214/2025, ano de
  calibragem 2026, dado pelo usuário), ICMS interna — 27 UF, **todas com o mesmo
  18,0000% placeholder, marcado a calibrar com o contador**, deliberadamente uniforme
  pra não parecer pesquisa real (CLAUDE.md 1.6) — e ICMS interestadual 7%/12%, dado real
  da consulta
- `IbsCbsTaxSituation` (D-043): CST + `cClassTrib` do CT-e não é constante — padrão de
  transporte rodoviário totalmente tributado é `000`/`000001`, mas a tabela oficial do
  Portal Nacional tem mais de 160 combinações, atualizada por Nota Técnica periódica.
  Tabela de domínio, mesmo critério de `QuoteCostType` (D-020/D-041): `tenantId` nulo =
  padrão do sistema, tenant pode registrar combinação própria por `INSERT`. Semeada só a
  linha padrão — atualização periódica das ~160 combinações restantes é pendência
  registrada, não construída (`decisoes.md`)
- `OrderStatus` (D-038, achado nº 4 da auditoria D-036): mesmo padrão `QuoteStatus` —
  `tenantId` nulo = padrão do sistema, catálogo compartilhado. Semeados só
  `IN_PROGRESS`/`COMPLETED`/`CANCELLED` (evidência de planilha real: coluna STATUS com
  FINALIZADO/ANDAMENTO/CANCELADO em uso) — não a taxonomia completa, sem `isPublic`
  (não pedido, D-010 hoje mora no status da viagem, não do pedido)
- `Order`: `branchId` obrigatório (D-011), `senderId`/`recipientId`/`tomadorId` como três
  FKs próprias pra `Party` (D-031 — só `tomador` fica em português, tem definição
  fiscal; os outros dois traduzem sem perda), congela valor nos dois caminhos de
  precificação (via `Quote` ou direto da `FreightRate`). `number` (D-015/D-035):
  atribuído por `DocumentCounter` na mesma transação do `INSERT`, único em
  `tenantId+branchId`, nunca a PK, nunca aparece como UUID. `statusId` (D-038): único
  `UPDATE` liberado a `mash_app` (junto de `updatedAt`) — nasce `IN_PROGRESS`
  (`OrderService`), cancelar não reabre `number` pra reuso (a coluna nunca entra no
  `GRANT`). `customerReference` (D-038): opcional, texto livre — referência do cliente
  ("PRA 7497/24"), busca por índice GIN trigram (`pg_trgm`), não `btree` — formatos sem
  prefixo comum, operador digita pedaço do meio do número

**Operação** (`Trip`, `TripStatus`, `RiskClearance`, `Occurrence`, `OccurrenceType`)
- `Trip`: um destino por viagem (D-018), composição de veículo (`vehicleId`+
  `trailer1Id`+`trailer2Id`) pertence à viagem, não ao cadastro. `sequence` (D-037,
  transbordo): ordem da perna dentro do `Order`, `(orderId, sequence)` único no banco,
  deliberadamente sem exigir contiguidade — perna cancelada pode deixar buraco, sem
  numeração-contador (diferente de `Order.number`/D-035, não há motivo fiscal aqui).
  Encadeamento de endereço entre pernas (destino da N = origem da N+1) é regra de
  aplicação, não constraint.
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
- **Janela de tempo estruturada (D-045):** `DayPeriod` (tabela de domínio, D-020, nove
  códigos confirmados em dado real — mesmo padrão `OrderStatus`/`QuoteCostType`) +
  `PickupOrder.pickupStartTime`/`pickupEndTime` (texto `"HH:mm"`, não `time` nativo —
  evita a confusão de fuso da D-016)/`pickupEndsNextDay`/`pickupDayPeriodId` (FK,
  `ON DELETE RESTRICT`). `pickupWindow` renomeado pra `pickupTimeNote` (`RENAME COLUMN`,
  D-031/D-033). `pickupDate` virou nullable. Cinco `CHECK` impõem as invariantes de
  `TimeWindow` (`@mash/shared`) no banco, cada uma com o caso `NULL` testado
  (`pickup-order-time-window-check.e2e-spec.ts`, 19 testes — mesma disciplina de guarda
  contra lógica de três valores do `TaxRate`, D-043). `PickupOrderService.generatePdf`
  usa `formatTimeWindow` quando há algo estruturado, rótulo de `DayPeriod.name`, cai em
  `pickupTimeNote` quando não há nada — sete formas verificadas no PDF real
  (`pickup-order-pdf.e2e-spec.ts`).

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

**Financeiro — contas a receber** (`Invoice`, `Boleto`, `ReceivableEvent`, `Attachment`,
D-042, revisa D-025)
- `Invoice`: ancora em `Order` (não CT-e, que não existe — `Trip` não carrega valor
  nenhum, só `Order.total`, D-014; ratear entre viagens seria inventar contorno pela
  ausência do CT-e). Sem `InvoiceLine`: `Order.invoiceId` direto (evidência é 1:N, não
  N:N) — `GRANT UPDATE` novo em `invoiceId`, mesmo mecanismo de `statusId` (D-038). Sem
  status, sem total — "quanto falta receber" deriva de `SUM(order.total)` menos
  `ReceivableEvent`. `number` via `DocumentCounter` (`BusinessDocumentType` ganha
  `INVOICE`, aditivo). Imutável por inteiro — nenhum `UPDATE` liberado
- `Boleto`: registro do boleto emitido no banco da transportadora (D-042 reverte a
  direção da D-025 — emitir por provedor trocaria a conta em que o dinheiro do cliente
  cai, objeção comercial). Número, vencimento, valor, linha digitável; PDF via
  `Attachment`. 1:N com `Invoice` (mesmo critério de `TollVoucherPurchase`/D-036: barato
  1:N agora, caro retrofitar depois). Imutável por inteiro
- `ReceivableEvent`: livro append-only, espelha `CarrierPayment` (D-032) do outro lado
  do caixa — `PAYMENT`/`REVERSAL` só (menor que `CarrierPayment`, sem
  `ADVANCE`/`DEDUCTION` — não evidenciados do lado do recebível).
  `reversesReceivableEventId` com `CHECK` nos dois sentidos + índice único parcial,
  mecanismo idêntico ao de `CarrierPayment`. Saldo nunca é coluna, sempre `SUM`
  sinalizado. Imutável por inteiro
- `Attachment`: metadado de anexo (canhoto — gatilho do faturamento — e PDF de boleto),
  decisão nova. `ownerType`(`TRIP`/`BOLETO`)+`ownerId` polimórfico, sem FK (D-030, RLS é
  o único guarda, sem segunda camada de autorização); `type` é dimensão separada
  (`PROOF_OF_DELIVERY`/`BOLETO_PDF`). Storage: Cloudflare R2 (decidido pelo usuário,
  não escolhido sozinho) — **integração real (upload/URL assinada) não construída**,
  sem bucket/credencial pra testar contra algo de verdade; `objectKey` é só metadado
  hoje. Append-only
- `Party.invoicingPreference`: texto livre, opcional — evidência de campo não sustenta
  taxonomia de ciclo de faturamento, só um campo pra anotar a preferência
- Sem serviço/controller pras quatro tabelas — mesmo padrão já aceito de
  `CarrierHire`/`CarrierPayment` (modelo e teste, sem serviço, até existir uso real)

**Endpoints HTTP hoje:** quatro — `GET /` (público), `POST /auth/login` (público),
`GET /me/users` (protegido, exemplo mínimo de wiring), `GET /pickup-orders/:id/pdf`
(protegido, gera o PDF sob demanda — D-034). `Quote`/`Order`/`Trip` têm serviço
(`QuoteService`, `OrderService`) mas nenhum controller; `PickupOrder` tem os dois, mas
só porque gerar PDF é lógica que não dá pra testar batendo direto no banco — criação
do registro continua via Prisma direto, sem service. `NumberingService` (D-035) é
serviço sem controller nem entidade própria além de `DocumentCounter` — consumido por
`OrderModule`, pronto pra CT-e/fatura importarem.

---

## Testes: 315 passando no backend (6 arquivos/23 unitários + 57 arquivos/292 e2e), zero
mock de banco — mais 65 no `shared/` (`npm test` dentro de `shared/`, todos passando,
incluindo `time-window.fixture.spec.ts` contra a planilha real, ver "`@mash/shared`"
acima). **Números verificados contra o banco já sincronizado com as 29 migrações — não
contra um `prisma migrate reset --force` (D-045: bloqueado pelo guard de IA do Prisma
CLI, aguardando confirmação explícita do usuário).**

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
| Dois caminhos de precificação, valor congelado estável, `UPDATE`/`DELETE` recusados; único `UPDATE` liberado é `statusId`/`updatedAt` (D-038) — `rate` e `number` seguem recusados mesmo junto de `statusId` na mesma chamada, cancelar não muda `number` | `order-pricing.e2e-spec.ts` |
| Tomador é FK própria, obrigatória, não computada | `order-tomador-is-own-field.e2e-spec.ts` |
| Status compartilhado (`tenantId` nulo = padrão do sistema) | `quote-status-rls.e2e-spec.ts` |
| `OrderStatus` compartilhado (`tenantId` nulo visível a todos, status próprio de outro tenant invisível, D-038) | `order-status-rls.e2e-spec.ts` |
| `Order.customerReference`: busca por pedaço do meio do número (não só prefixo), case-insensitive, campo opcional (D-038) | `order-customer-reference-search.e2e-spec.ts` |
| `QuotePricingCalculator` (D-041/D-043, unitário — sem banco): etapa 1 isolada (ICMS por dentro, `preço = base ÷ (1−alíquota)`), etapa 2 isolada (IBS/CBS sempre calculados, só somados ao preço quando `composesPrice=true` — ausência de dízima prova que soma, quando ativa, é simples, não gross-up), caso conferido à mão do pipeline completo com `composesPrice=false` (calibragem 2026: custo 820/ICMS 18%/margem 20% → 1250, IBS/CBS calculados mas não somados), prova numérica de que o preço não muda "ligando"/"desligando" o parâmetro em 2026, margem sai igual à pedida depois da recomposição, erro de markup-sobre-custo demonstrado como inferior, soma de custo via `.plus()` nunca operador nativo | `quote-pricing-calculator.spec.ts` |
| `calculateTaxOnAgreedValue` (D-043, unitário — sem banco): multiplicação simples sobre valor já acordado, `finalPrice` nunca muda; prova estrutural (leitura do código-fonte de `quote.service.ts`) de que o caminho de produção usa `calculateQuotePricing` e nunca essa função — os dois caminhos não chamam a mesma lógica cegamente | `tax-composition-calculator.spec.ts` |
| `TaxRate` sem fronteira de tenant — qualquer tenant (e sem tenant nenhum) enxerga, `INSERT`/`UPDATE`/`DELETE` recusados pra `mash_app` (D-041) | `tax-rate-rls.e2e-spec.ts` |
| Vigência de `TaxRate`: sobreposição recusada/aceita (mesmo tributo+UF+`icmsOperationType`), sobreposição entre linhas nacionais (`uf` nulo) recusada — prova o `coalesce`/`CASE`, `CHECK`s taxType↔icmsOperationType e icmsOperationType↔uf (incluindo o caso NULL que expôs o bug de lógica de três valores, D-043), duas linhas interestaduais (7%/12%, ambas `uf` nulo) coexistindo sem colidir no `EXCLUDE`, `ICMS_INTRAMUNICIPAL_RATE`, lookup por data usa a alíquota daquela data (não a de hoje) | `tax-rate-validity.e2e-spec.ts` |
| `TaxRateService` recusa alíquota placeholder fora de `NODE_ENV` `development`/`test` (inclusive vazia/ausente — falha fechada), aceita em `development`/`test`, IBS/CBS e ICMS interestadual passam mesmo em `production` (não são placeholder), confirma no banco que as 27 linhas de ICMS interna nascem `isPlaceholder=true` e as duas interestaduais nascem `false` (D-041/D-043) | `tax-rate-placeholder-guard.e2e-spec.ts` |
| Guarda de RLS: `TaxRate`/`Tenant` tratadas explicitamente como exceções deliberadas (política `USING (true)`, sem isolamento) — com o motivo escrito, separado da varredura genérica (D-041/D-029) | `rls-schema-guard.e2e-spec.ts` |
| `QuoteCostType` compartilhado (`tenantId` nulo visível a todos), tenant cria seu próprio tipo (D-041) | `quote-cost-type-rls.e2e-spec.ts` |
| RLS de `QuoteCostLine`, imutável por inteiro (`UPDATE`/`DELETE` recusados) desde a criação (D-041) | `quote-cost-line-rls.e2e-spec.ts` |
| `IbsCbsTaxSituation` compartilhada (`tenantId` nulo = caso padrão `000`/`000001` visível a todos), situação própria de outro tenant invisível, tenant registra sua própria combinação por `INSERT` (D-043) | `ibs-cbs-tax-situation-rls.e2e-spec.ts` |
| Caminho de custo ponta a ponta: preço final bate com as alíquotas REAIS semeadas na migração (não forjadas no teste), IBS/CBS calculados mas não somam ao preço em 2026 (`total`=1250, D-043), linhas de custo visíveis (detalhamento, não caixa preta), campos de entrada congelados mesmo depois de fechado, `DELETE` recusado, `CHECK` recusa os dois caminhos misturados (D-041) | `quote-cost-based.e2e-spec.ts` |
| Composição de veículo (cavalo+2 carretas, truck sozinho, `CHECK` recusando inválido) | `trip-composition.e2e-spec.ts` |
| Sequência de perna dentro do pedido (transbordo, D-037): três pernas em sequência, `sequence` duplicada no mesmo `Order` recusada, buraco na sequência aceito | `trip-sequence.e2e-spec.ts` |
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
| PDF real (não mock): 1 item cabe em 1 página; 40 itens produzem mais de uma página sem sobrepor nem cortar texto, todos os 40 presentes no texto extraído de volta com `pdf-parse`, cabeçalho "(continuação)" bate com o total de páginas menos uma; `UPDATE`/`DELETE` recusados em `PickupOrder` e `PickupOrderItem`; janela de coleta (D-045) nas sete formas de `TimeWindow` — faixa, exato, até, a partir de, período (rótulo `DayPeriod.name`), cruzando meia-noite, só nota — extraídas do PDF real com `pdf-parse` | `pickup-order-pdf.e2e-spec.ts` |
| Rota `GET /pickup-orders/:id/pdf` ponta a ponta (sem token → 401, com token → PDF com `Content-Type` correto, token de outro tenant não vaza PDF alheio) | `pickup-order-http.e2e-spec.ts` |
| `DayPeriod` compartilhado (`tenantId` nulo visível a todos, período próprio de outro tenant invisível, D-020/D-045) | `day-period-rls.e2e-spec.ts` |
| As cinco invariantes de `TimeWindow` impostas por `CHECK` em `PickupOrder` (formato `"HH:mm"`, `dayPeriodId` exclui horário, `endsNextDay` exige os dois horários e `end<start`, sem `endsNextDay` exige `end>=start`) — caso `NULL` de cada uma testado (D-045, mesma disciplina de guarda contra lógica de três valores do `TaxRate`, D-043) | `pickup-order-time-window-check.e2e-spec.ts` |
| RLS de `DocumentCounter` | `document-counter-rls.e2e-spec.ts` |
| Numeração (D-015): sequencial em criações sucessivas; unicidade de `(tenantId, branchId, number)` garantida no banco; `DocumentCounter` libera só `UPDATE` de `lastNumber`, `DELETE` recusado; rollback depois de pegar o número não desperdiça o número (reaproveitado na próxima criação real); **concorrência real** — 10 criações simultâneas via `Promise.all` produzem 10 números distintos sem buraco, com contenção de lock observada de verdade em `pg_stat_activity` (não só resultado correto por acaso) | `order-numbering.e2e-spec.ts` |
| Guarda: `TenantPrisma.transaction()` continua protegido por RLS (D-012, D-035) — leitura via `tx.<model>` e via `tx.$queryRaw` não vazam tenant, escrita no tenant alheio recusada, duas `transaction()` concorrentes de tenants diferentes não se misturam, e o contexto de tenant não vaza pra próxima conexão do pool depois que a transação termina | `tenant-prisma-transaction-rls.e2e-spec.ts` |
| RLS de `Invoice`, `UPDATE`/`DELETE` recusados (nenhuma coluna liberada), `Order.invoiceId` alcançável a partir do pedido (D-038/D-042) | `invoice-rls.e2e-spec.ts` |
| RLS de `Boleto`, mais de um boleto por fatura aceito (1:N), valor zero/negativo recusado, `UPDATE`/`DELETE` recusados (D-042) | `boleto-rls.e2e-spec.ts` |
| RLS de `ReceivableEvent`, valor zero/negativo recusado, `CHECK` amarra `REVERSAL`↔`reversesReceivableEventId` nos dois sentidos, duplo estorno recusado, `UPDATE`/`DELETE` recusados, saldo por `SUM` de eventos com e sem estorno (D-042) | `receivable-event-rls.e2e-spec.ts` |
| RLS de `Attachment`, "download" de outro tenant recusado na consulta que qualquer URL assinada futura precisaria fazer primeiro, dois `ownerType` diferentes (`TRIP`/`BOLETO`) aceitos, `UPDATE`/`DELETE` recusados (D-042) | `attachment-rls.e2e-spec.ts` |
| Decimal (unitário — sem banco): operador nativo concatena, `.plus()`/`.minus()` somam/subtraem certo na soma sinalizada de `ReceivableEvent` (PAYMENT soma, REVERSAL desfaz), D-013 (D-042) | `receivable-decimal.spec.ts` |
| Regime tributário de `Tenant` nasce nulo (assento reservado), aceita ser preenchido com `incomeTaxRegime`/`isSimplesIcmsContributor`/`ibsCbsApurationRegime` (D-043) | `tenant-rls.e2e-spec.ts` |
| `@mash/shared` resolve pelo npm workspace (fiação, não lógica de negócio) | `shared-workspace-import.spec.ts` |

Comando: `npm install` agora roda na RAIZ do repositório (workspaces) — não mais dentro de
`backend/`. Depois disso, `npm run test:e2e` (unitário: `npm test`), dentro de `backend/`,
continuam iguais **exceto que `npm run test:e2e` agora exige `backend/.env.test` — ver
unidade "separar o banco de teste do de desenvolvimento", abaixo — copiar de
`.env.test.example` e rodar `npm run db:test:setup` uma vez antes da primeira execução**.
`npx prisma generate` precisa ser rodado à mão depois do `npm install`
da raiz (ver "Repositório: npm workspaces" acima — npm 11 não roda mais esse
install-script sozinho).

---

## Em andamento

D-042 (faturamento e contas a receber, revisa D-025) e D-043 (corrige erro da D-041 —
IBS/CBS não compõem preço em 2026 — e amplia `TaxRate`/`Tenant`/`IbsCbsTaxSituation`,
com base em consulta contábil) modeladas, testadas e verificadas (`build`/`lint`/as duas
suítes, 286 testes) — **nenhuma das duas commitada ainda**.

**Duas decisões de modelo pendentes de revisão do usuário antes do commit** (levantadas
explicitamente, ainda não resolvidas):

1. `Attachment` polimórfico sem FK (`ownerType`+`ownerId`) — ver D-042 em `decisoes.md`
   pro raciocínio original (Postgres não tem FK que aponte pra "uma linha dentre várias
   tabelas possíveis" sem uma tabela de referência global que não existe aqui).
2. Canhoto ancorado em `Trip`, sendo que o faturamento é do `Order` e um `Order` pode ter
   várias `Trip` (transbordo, D-037) — ver D-042 pro raciocínio original (prova de
   entrega é evento por perna, não por pedido).

Não mudar nenhum dos dois sem confirmar com o usuário primeiro — a essa altura são só a
justificativa registrada, não uma decisão validada de novo.

---

## Próximo

Dentro do escopo v1 (D-028), ainda faltam dois blocos inteiros — nenhum dos dois tem
uma linha de código ainda:

- **Bloco fiscal: nenhum model `CTe` nem `MDFe` existe no schema.** Provedor escolhido
  em homologação — Focus NFe (D-044) — mas emissão via provedor (D-006) e importação de
  XML de NF-e (D-024) não começaram. `docs/CAMPOS-FALTANTES-MASH.md` já é o inventário
  de campo confirmado por execução real (não achismo de documentação) pra quando essa
  unidade começar; `docs/RESULTADO.md` documenta o comportamento real da API
  (idempotência, numeração, eventos, arquivos, achados de negócio não documentados).
  MDF-e tem uma lacuna real não resolvida (ver `decisoes.md`, pendências).
- **Frontend: zero tela construída até aqui.** Todo o trabalho até agora é backend
  (`backend/`) — nenhum componente React, nenhuma rota de UI, nada em `frontend/` (a
  pasta nem existe).
- Averbação (D-023) — depende de saber se a AT&M tem API (pendência bloqueante em
  `decisoes.md`)
- Fatura e contas a receber (D-042, revisa D-025) — modelo e teste prontos
  (`Invoice`/`Boleto`/`ReceivableEvent`/`Attachment`), falta: serviço/controller,
  integração real de storage (Cloudflare R2 — upload/URL assinada), e as duas decisões
  de modelo em revisão (ver `Em andamento`)
- Pagamento a terceiro (`CarrierHire`/`CarrierPayment`, D-019) — modelo pronto, falta
  serviço/controller

---

## Pendências técnicas conhecidas

- **`docs/deploy-checklist.md`** — 5 itens abertos, nenhum verificado contra a
  plataforma de produção: `CREATE EXTENSION btree_gist` sem superuser, `CREATE
  EXTENSION pg_trgm` sem superuser (D-038, mesma categoria de risco), versão de Node
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
  CI/deploy se a plataforma usar `npm ci` com esse comportamento. **Reconfirmado depois
  da reestruturação em npm workspaces** (`npm install` agora roda na raiz): mesmo aviso,
  mesma necessidade de `npx prisma generate` manual dentro de `backend/` depois do
  install — o comportamento não mudou com workspaces, só o diretório de onde o `npm
  install` roda.
- **`npm install pdfkit` (D-034) também exigiu `--legacy-peer-deps`.** Mesma família de
  problema do item `nestjs-cls` abaixo, não um conflito novo do pdfkit em si: o `npm
  install` puro falha com `ERESOLVE` porque `nestjs-cls@6.2.2` declara peer
  `@nestjs/common`/`@nestjs/core` `>= 10 < 12` e o projeto está em `@nestjs/common@12` —
  qualquer `npm install` que precise re-resolver a árvore de dependências esbarra nisso,
  não só a instalação inicial. Confirma que **todo `npm install`/`npm ci` futuro no
  projeto precisa de `--legacy-peer-deps`** enquanto o `nestjs-cls` não publicar suporte
  a Nest 12 (ou o Nest não for rebaixado) — isso inclui o `npm ci` de deploy (D-005):
  se a plataforma gerenciada rodar `npm ci` sem essa flag, o build de produção quebra
  no mesmo `ERESOLVE`. **Parcialmente endereçado nesta sessão:** `.npmrc` na raiz do
  repositório agora fixa `legacy-peer-deps=true` (lido por `npm install` e por `npm ci`
  automaticamente, sem precisar da flag na linha de comando) — mas ainda não verificado
  contra o `npm ci` real do pipeline de deploy (a plataforma gerenciada pode ter
  configuração própria que ignore `.npmrc` do projeto). Ação pendente antes do primeiro
  deploy real continua de pé, só o mecanismo mudou de "lembrar de passar a flag" para
  "confirmar que a plataforma respeita o `.npmrc`".
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
  controle de versão). Banco novo exige `npx prisma migrate deploy` (28 migrações) antes
  da suíte e2e — sem isso os testes falham por schema ausente, não por RLS.
- **`pdfkit`/`pdf-parse` instalados nesta sessão** (D-034) — mesmo `--legacy-peer-deps`
  do `nestjs-cls`, nenhuma vulnerabilidade nova no `npm audit` (as 4 de alta severidade
  continuam as mesmas do CLI do Prisma, já registradas acima). `@types/pdf-parse` foi
  instalado por engano (a v2 do `pdf-parse` é reescrita como classe e publica os
  próprios `.d.ts`; o pacote de tipos era pra API antiga da v1) e removido no mesmo
  passo — não sobrou no `package.json`.

## Unidade "a casca do frontend"

Pronto, confirmado no navegador de verdade: `frontend/` existe (Vite+React+TS+Tailwind+
shadcn), sessão do backend migrada de JWT no header para cookie httpOnly + tabela
`Session` (D-048), login/logout/`GET /me` funcionando ponta a ponta, layouts de app e
auth, Ctrl+K só navegação, esqueleto de carga, tela `/` pós-login (sidebar+cabeçalho+
"Bem-vindo, Smoke User") visualmente confirmada. `docs/decisoes.md` ganhou D-049 nessa
sessão, mas o commit ficou pendente (limite de sessão) — **ainda não commitado**, não
tocado nesta unidade por instrução explícita de não editar `decisoes.md` aqui.

## Unidade "primeira tela de negócio — cotação por custo, parte 1"

**Escopo:** montar a cotação, ver o preço recalculando ao vivo, salvar como rascunho.
Fechar/aceitar/recusar (D-046/D-047), lista de cotações e criação de cliente no fluxo são
a parte 2 — não construídos aqui, de propósito.

**Pronto:**
- Três rotas HTTP novas, nenhuma existia antes desta unidade:
  `GET /quote-cost-types` (`QuoteCostTypeController` — lê a tabela de domínio D-020, não
  chumba lista), `GET /tax-rates/quote-preview?icmsUf=UF` (`TaxRateController` — primeira
  exposição HTTP de `TaxRateService`; mesmas três buscas que `QuoteService.close()` já
  fazia: ICMS interna por UF, IBS e CBS nacionais, sempre com "agora" como data —
  `Quote.icmsUf` é campo único, não par origem/destino, então `findInterstateIcmsRate()`
  nunca se aplica aqui), `POST /quotes/cost-based` (`QuoteController` — primeiro
  controller de `Quote`; valida com `createCostBasedQuoteSchema` do `@mash/shared` e
  chama `QuoteService.createCostBased()`, que **já aceitava margem** desde D-041, sem
  mudança nenhuma no service).
- `@mash/shared` ganhou `brazil/` (`BRAZILIAN_STATE_CODES`, as 27 UF — fixo por lei,
  D-020) e `quote/` (`createCostBasedQuoteSchema`/`quoteCostLineInputSchema`, mais
  `moneyAmountSchema`/`marginPercentage Schema` exportados pra o frontend derivar sem
  duplicar regra).
- Tela `/cotacoes/nova-por-custo`: UF → linhas de custo (tipo lido do banco, valor
  mascarado pt-BR) → margem OU preço final (os dois editáveis, um recalcula o outro,
  usando `calculateQuotePricing` de `@mash/shared` — nunca reimplementado; a inversão
  preço→margem é álgebra nova e pequena, em Decimal, D-013) → salvar rascunho. Teclado
  completo: foco automático na UF, Enter avança, Enter na última linha de custo cria
  linha nova e foca o tipo, tudo alcançável só com Tab/Enter (confirmado no navegador
  sem mouse, exceto o clique final em "Salvar" numa das passadas — Enter no campo de
  preço não disparou o submit nativo de forma confiável nesta sessão de controle remoto
  do navegador; a tecla Enter em todo o resto do formulário funcionou). Cabe em
  1366×768 sem rolar — confirmado por iframe isolado na mesma origem (764px de altura
  mesmo com 3 linhas de custo, grid de custo com `overflow-y-auto` próprio absorve
  linhas extras sem empurrar a página).
- Rascunho nasce OPEN guardando só as ENTRADAS (linhas de custo, margem, UF) — preço e
  alíquotas continuam nulos até `close()` (parte 2). Confirmado direto no Postgres depois
  de salvar pelo navegador: `marginPercentage`/`icmsUf` batem com o que foi digitado,
  `total`/`icmsRateApplied` nulos, linhas de custo com o valor e descrição exatos.
- Suítes: `shared` 85→96 (+11: schema novo com bordas de validação — UF inválida, margem
  ≥100%, descrição vazia/só espaço normalizada pra `undefined`), `backend` 334→343
  (+9: `quote-cost-based-http.e2e-spec.ts`, as três rotas novas, RLS entre tenants,
  guarda de placeholder de alíquota propagada como 422 com o motivo), `frontend` 6→6
  (nenhum teste automatizado novo — verificação desta tela foi manual no navegador,
  como pedido). Build e lint limpos nos três workspaces.

**Achados de sessão, não do código desta unidade:**
- `backend/.env` não tinha `NODE_ENV` (só o `.env.example` tinha) — sem isso,
  `TaxRateService` recusa a alíquota placeholder de ICMS mesmo em dev, e a tela nunca
  calcula nada. Corrigido no `.env` (git-ignored, não vai pro commit).
- `npm run test:e2e` roda contra o MESMO Postgres do `docker-compose` que os servidores
  de desenvolvimento usam, e vários arquivos de teste fazem `TRUNCATE ... "Tenant"
  CASCADE`. Rodar a suíte inteira **apaga** tenant/usuário de teste manual e as tabelas
  de domínio compartilhadas (`QuoteCostType`, `QuoteStatus` inclusive) — precisou
  re-semear à mão depois de cada rodada pra continuar testando no navegador. Não é bug
  desta unidade; é risco pré-existente de dev e e2e compartilharem banco, vale registrar
  em algum lugar antes que vire surpresa recorrente.
- `.env` de dependência: `decimal.js` foi adicionado como dependência EXPLÍCITA do
  `frontend/package.json` (antes só chegava por hoist do workspace, via `@mash/shared`)
  — necessária pra inversão preço→margem em Decimal (D-013 sem exceção, mesmo em cálculo
  de UI). Decisão tomada durante a execução, não pedida explicitamente.

**Não ficou pronto / fora do escopo, fica para a parte 2:** fechar cotação (`close()`),
aceitar/recusar, tela de lista, criação de cliente no fluxo, endpoint de detalhe de uma
`Quote` existente (o rascunho salvo hoje só é visível direto no banco).

## Unidade "separar o banco de teste do de desenvolvimento"

**Por quê:** achado da unidade anterior — `npm run test:e2e` rodava contra o mesmo
Postgres do `docker-compose` que o servidor de desenvolvimento usa, e vários arquivos
fazem `TRUNCATE ... "Tenant" CASCADE`, apagando tenant/usuário semeados à mão e as
tabelas de domínio compartilhadas (`tenantId IS NULL` — mesmo comportamento já visto na
D-045 com `DayPeriod`). O ambiente de trabalho foi perdido duas vezes numa sessão só.

**Pronto:**
- `mash_test` — banco NOVO, MESMO cluster/roles do banco de desenvolvimento
  (`mash_owner`/`mash_app`, `docker-compose.yml` já existente, porta 5433). Não é um
  Postgres separado: `mash_app` é role de CLUSTER (sobrevive a reset), então só faltava
  `GRANT CONNECT` no banco novo. Migrações rodadas contra `mash_test` produzem GRANTs e
  RLS **byte a byte idênticos** aos de `mash` — confirmado comparando
  `information_schema.role_table_grants`/`role_column_grants` das duas bases (44 linhas
  de coluna em `Quote`, mesmas em ambas) — porque os dois bancos rodam a MESMA sequência
  de migrações, que já criam RLS/GRANT via `ALTER DEFAULT PRIVILEGES` (D-012). Nenhum
  GRANT foi reescrito à mão.
- `backend/.env.test` (git-ignored, exemplo committed em `.env.test.example`) —
  `DATABASE_URL`/`DATABASE_URL_APP` apontando pra `mash_test`, mesmas credenciais de
  `mash_owner`/`mash_app` do `.env` de dev.
- `backend/scripts/prepare-test-db.mjs` (`npm run db:test:setup`) — cria `mash_test` se
  não existir (idempotente, não recria se já existir), garante `GRANT CONNECT` pra
  `mash_app`, roda `prisma migrate deploy`. Não existe passo de "semente" separado — as
  migrações já semeiam as tabelas de domínio (D-020/D-041/D-043/D-045), então rodar as
  migrações de novo é rodar a semente de novo.
- `backend/test/setup-e2e-env.ts` — `vitest.config.e2e.ts` aponta pra ele em vez de
  `dotenv/config`. Lê `.env.test` com `dotenv.parse()` (nunca `process.env` — nenhuma
  ambiguidade com o que o shell já tiver exportado, a mesma classe de problema do
  `NODE_ENV` vazio vencendo o `.env`). **Falha fechada, duas guardas, verificadas de
  verdade rodando a suíte cada vez:** (1) sem `.env.test`, a suíte recusa TODOS os 60
  arquivos com mensagem clara, zero teste roda; (2) `.env.test` com a MESMA
  `DATABASE_URL`/`DATABASE_URL_APP` do `.env` de dev, mesma recusa — protege contra o
  arquivo copiado por engano, não só a ausência dele. Nenhuma das duas depende de
  `NODE_ENV`.
- **A verificação que importa:** suíte e2e inteira rodada contra `mash_test` (329
  testes) e, depois, tenant `smoke-test`, usuário `smoke@test.com`, as cinco linhas de
  `QuoteCostType` e a `Quote` salva pela tela na unidade anterior — todos ainda intactos
  em `mash` (banco de dev), confirmado direto no Postgres. Não precisou resemear nada.
- Suítes (números exigidos, confirmados iguais): `shared` 96, `backend` 343 (14
  unitários + 329 e2e), `frontend` 6. Build e lint limpos nos três workspaces. Nenhum
  teste, asserção ou lógica de aplicação foi alterado — só o carregamento de ambiente.

**Decisões tomadas que não estavam no pedido:**
- Banco novo no MESMO cluster, não um segundo container/Postgres separado — mais simples
  e é o que garante GRANTs idênticos de graça (mesmas roles, mesmas migrações).
- Guarda extra além do "falha se `.env.test` não existir": recusa também se a URL bater
  com a do `.env` de dev — o pedido citava só a ausência do arquivo, mas o acidente mais
  provável é copiar o `.env` errado, não esquecer de criar um.
- `npm run db:test:setup` não faz `DROP`/`migrate reset` — é idempotente (cria se faltar,
  sempre roda `migrate deploy`). Dado sujo de execução anterior já se resolve pelo
  `TRUNCATE`+resemeadura que cada arquivo de teste já faz no próprio `beforeEach` (não
  mudado nesta unidade); "sujo" tratado aqui é só "schema ausente ou atrasado". Evita
  bater na regra do `CLAUDE.md` sobre `migrate reset` exigir confirmação explícita a cada
  execução — mesmo sendo um banco descartável por natureza.
- `docs/deploy-checklist.md` ganhou um item novo: banco de teste nunca pode existir na
  plataforma de produção, e se um CI for criado depois, ele precisa do próprio
  `.env.test` contra um Postgres efêmero — nunca o banco de produção "só pra testar uma
  vez".

**Não tocado, de propósito:** `docs/decisoes.md` (instrução explícita desta unidade) e
`docs/deploy-checklist.md` continuam com a entrada de D-049 pendente de commit de uma
sessão anterior — não é desta unidade, não misturado no commit.

## Unidade "cotação por custo, parte 2 — fechar com prazo e aceitar criando o pedido"

**Por quê:** a parte 1 (D-050) só monta e salva rascunho. Sem fechar/aceitar/recusar, a
cotação nunca produz o pedido — a hipótese do produto (calculadora mais rápida que a de
mão) fica sem completar o ciclo até a operação.

**Bloqueio confirmado antes de construir (a pergunta que o pedido marcou como mais
importante):** `accept()` exige `OrderParties` (filial + remetente/destinatário/tomador),
e `Quote` no caminho CUSTO não guarda nenhum dos quatro (D-047) — e não existia rota HTTP
nenhuma pra `Party`/`Branch`, só os models Prisma. Confirmado com o usuário antes de
escrever código: construir `GET /parties`/`GET /branches` (leitura simples, sem
paginação/busca/criação) pra popular os quatro seletores — não é "criar cliente no
fluxo" (isso continua fora, depende de modelagem que não existe). Consequência aceita:
hoje nenhum tenant real tem `Party` cadastrada (zero tela de cadastro construída), então
a tela mostra "Nenhuma parte cadastrada" até essa modelagem existir — verdade do
produto, não bug.

**Pronto:**
- `GET /parties`, `GET /branches` (`PartyController`/`BranchController`, módulos novos)
  — leitura mínima, `active: true` em `Party` (D-017).
- `GET /quotes/:id` — estado completo de UMA cotação por id direto (não é lista, D-050
  já tinha deixado isso de fora): `statusCode`, `isExpired` DERIVADO a cada leitura
  (`isQuoteValidityExpired`, nunca um status próprio, nunca job periódico), linhas de
  custo, alíquotas aplicadas, `total`, e o pedido (se aceita). **Decisão:** não recompõe
  o detalhamento de imposto em R$ (ICMS/IBS/CBS) — `TaxRate.composesPrice` usado no
  fechamento não fica congelado em nenhuma coluna própria de `Quote`, só as alíquotas
  (%) e o `total` ficam; recalcular agora com o `composesPrice` de hoje arriscaria um
  número que parece preciso e pode não ser o que valeu no fechamento (CLAUDE.md 1.6). A
  tela mostra % aplicada e total, nunca um R$ de imposto inventado.
- `POST /quotes/:id/close` — prazo (`validityTerm`) **obrigatório no contrato** (o
  service continua aceitando opcional por compatibilidade, D-046, mas a rota da tela
  sempre manda). Usa `computeQuoteValidUntil` de `@mash/shared` sem reimplementar.
- `POST /quotes/:id/accept` — idempotente: a segunda tentativa vira **409** ("Cotação já
  foi aceita"), não 500 nem erro genérico — testado de verdade (e2e com duplo POST, e no
  navegador com `fetch` direto contra uma cotação já aceita, ainda com
  `branchId`/`Party` inválidos, confirmando que a guarda de idempotência dispara ANTES
  de tocar `orderInput`). Cotação vencida vira 422 com "vencida" na mensagem.
- `POST /quotes/:id/reject` — reaproveita `REJECTED`/"Recusada" (D-046); vencida pode
  ser recusada normalmente, só `accept()` tem a guarda de vencimento.
- Nenhuma migração — como o pedido antecipava, tudo já existia no schema (D-046/D-047).
- Tela `/cotacoes/$id` (link direto, não lista): cinco estados — Rascunho, Fechada
  (válida até DD/MM), Fechada e vencida (derivado, vermelho, só "Recusar" disponível,
  motivo explícito na tela), Aceita (mostra número do pedido/viagens/preço unitário),
  Recusada — cada um com ação própria, verificados um a um no navegador (inclusive
  vencida, simulada movendo `validUntil` pro passado direto no banco, e recusada).
  Fechar/aceitar/recusar são irreversíveis: botão primário só abre confirmação ("Tem
  certeza?"), a ação de fato só dispara no segundo botão — nenhum dos três é acionável
  batendo Enter num campo de texto (os botões de confirmação inicial são `type="button"`,
  não `type="submit"`, então não existe submissão implícita de formulário pra interceptar).
  A parte 1 (`quote-cost-based.tsx`) mudou o pós-salvar: navega pra `/cotacoes/$id` em
  vez de resetar o formulário — agora existe um lugar pra ir.
- Cabe em 1366×768 sem rolar nos cinco estados — confirmado por iframe isolado (764px de
  altura), mesma técnica da parte 1.
- Suítes: `shared` 96→104 (+8: `closeQuoteSchema`/`acceptQuoteSchema`, bordas de
  validação), `backend` 343→358 (+15: `quote-lifecycle-http.e2e-spec.ts`, as seis rotas
  novas — `GET/POST` de `Quote`, `GET /parties`, `GET /branches` — idempotência do
  aceite provada por fora, formato de erro por rota), `frontend` 6→6 (sem teste novo,
  verificação manual no navegador, como pedido). Build e lint limpos nos três
  workspaces. Suíte e2e rodada contra `mash_test`; depois, tenant `smoke-test`, `Order`
  e `Quote` confirmados intactos no banco de DESENVOLVIMENTO.

**Achado de sessão, não desta unidade:** `OrderStatus` e `TripStatus` (`tenantId` nulo,
semeados via migração) estavam **vazios no banco de desenvolvimento** — dano de antes da
separação de banco de teste (unidade anterior), nunca restaurado, e bloqueava `accept()`
de verdade (não só no teste). Restaurado à mão, junto com uma `Party` de teste (zero
existia pro tenant `smoke-test` — nenhuma tela de cadastro construída ainda, D-047).

**Decisões tomadas que não estavam no pedido:**
- `GET /parties`/`GET /branches` — confirmado com o usuário antes de construir (ver
  acima), não assumido em silêncio.
- `@HttpCode(200)` explícito em `close`/`accept`/`reject` — são ações sobre um recurso
  que já existe, não criação (o padrão do Nest pra `POST` é 201, certo pra
  `/quotes/cost-based`, errado semanticamente pros três verbos de ação).
- Distinguir "já tem desfecho" (`accept()`/`reject()` lançam a mesma mensagem genérica)
  em dois códigos HTTP diferentes: 409 só quando o desfecho existente é `ACCEPTED`
  (idempotência de verdade — a tela lê como "já aceita"); 422 quando é `REJECTED`
  (tentar aceitar uma cotação já recusada é erro de negócio, não repetição da mesma
  ação). Exigiu uma leitura extra do `Quote` dentro do `catch`, sem tocar o service.

**Fora do escopo, não construído (como pedido):** criar cliente no fluxo, revisão/
recotação, lista de cotações.

## Unidade "criar cliente sem sair do fluxo (modal com CNPJ)"

**Por quê:** hoje nenhum tenant real tem `Party` cadastrada — a parte 2 só funcionava
porque uma `Party` foi criada à mão no banco. Sem um jeito de criar cliente/filial de
dentro do aceite, a tela de cotação é inutilizável em produção (sai do fluxo pra cadastrar
em outro lugar que nem existe ainda — a fragmentação que o produto quer curar).

**Investigado antes de codar (como exigido):**
- `Party.cnpj`/`Party.cpf` são nullable no schema, mas a CHECK
  `Customer_document_matches_person_type` amarra `personType='COMPANY'` a `cnpj NOT NULL,
  cpf NULL` (nome da constraint sobrevive à renomeação Customer→Party) — logo pra esta
  unidade (só CNPJ, empresa) `cnpj` é obrigatório na prática, mesmo sem `NOT NULL` puro na
  coluna.
- Endereço é entidade própria (`Address`), não colunas em `Party` — 1:N, `partyId`
  obrigatório na FK mas nenhum campo de `Address` é obrigatório do lado de `Party` (a
  parte pode não ter endereço nenhum).
- `Party` não representa papel (cliente/fornecedor/motorista) — papel vem de outra
  modelagem (`OrderParties` referencia `Party` por função no pedido); esta unidade só cria
  o cadastro genérico.
- Nenhum validador de CNPJ existia em `@mash/shared` — construído nesta unidade
  (`shared/src/brazil/cnpj.ts`), não no frontend, pra ficar disponível pro backend
  revalidar o mesmo dígito verificador.
- `Branch` é só `id`, `tenantId`, `name` — nenhum campo extra a decidir.

**Pronto:**
- `isValidCnpj`/`onlyDigits` em `@mash/shared` (`shared/src/brazil/`) — checksum mod-11,
  rejeita sequência de dígito repetido.
- `createPartySchema`/`createPartyAddressSchema`/`createBranchSchema` em `@mash/shared`,
  usados sem duplicação nos dois lados (D-021): `cnpjFieldSchema` normaliza pontuação e
  valida o dígito verificador; endereço é **tudo ou nada** (schema recusa endereço
  parcial — se faltar um campo obrigatório, o backend descarta o endereço inteiro em vez
  de falhar a criação da `Party`, ver abaixo).
- `POST /parties` — cria `Party` (+ `Address` se completo) em uma transação
  (`TenantPrisma.transaction`); CNPJ duplicado no tenant vira **409** com
  `{message, existingParty: {id, name, cnpj}}` (detectado via `P2002` do Prisma, não
  checado antes — evita corrida). `GET /parties/cnpj/:cnpj` — consulta a BrasilAPI
  (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`, verificada por `curl` antes de codar:
  pública, sem chave, CORS liberado, mas chamada pelo backend mesmo assim, pra manter
  chamada externa centralizada e com timeout controlado) e nunca lança — timeout de 5s
  (`AbortController`), 404 vira "não encontrado", qualquer outra falha (rede, timeout,
  status não-2xx) vira mensagem explícita e `found: false`; a consulta é acionada só no
  blur do campo CNPJ, depois de validar o dígito verificador localmente (nunca manda dígito
  inválido pra API).
- `POST /branches` — cria `Branch` simples.
- Erros seguem o padrão do `AuthController.login`: `BadRequestException(zod.flatten())` →
  `{fieldErrors, formErrors}` — nenhum filtro de exceção global criado (item pendente de
  D-050, fora desta unidade).
- Modal `CreatePartyModal`/`CreateBranchModal` abre a partir do "+ Criar..." do
  `EntityCombobox` (combobox novo, sem dependência nova — ver decisões) nos quatro campos
  do aceite (filial, remetente, destinatário, tomador). Só pede **CNPJ e razão social** —
  os únicos campos que o operador tem como preencher agora sem ver a tela de cadastro
  completa; endereço nunca é formulário manual, só auto-preenchido pela consulta ou
  ausente. Fechar com Esc não cria nada e não perde nada do formulário de aceite (a
  cotação sendo aceita e o modal são componentes irmãos — o modal só toca o formulário via
  um `setValue` no sucesso, então o resto do estado do aceite nunca é tocado). Parte criada
  já vem selecionada no seletor que abriu o modal. CNPJ duplicado oferece "Usar
  '{nome}'" que seleciona a parte existente em vez de recusar sem saída.
- Testado sem mouse, do zero (tenant novo `smoke-test-2`, zero `Party` semeada à mão):
  montar cotação → fechar com prazo → aceitar criando as duas partes pelo modal (uma delas
  com falha real da BrasilAPI — 403 e depois 429, genuínas, não simuladas — confirmando que
  a criação segue mesmo com a consulta fora) → filial criada pelo modal → pedido nasce
  (Número 1, Viagens 1, preço unitário confirmado). Esc no modal verificado não perder
  nada do formulário nem criar nada.
- Cabe em 1366×768 com o modal aberto sobre a tela de aceite — confirmado por iframe
  isolado, inclusive abrindo o modal de verdade dentro do iframe (evento de input
  sintético, mesma técnica das unidades anteriores).
- Sem migração — como o pedido antecipava, nada mudou no schema.
- Suítes: `shared` 104→120 (+16: CNPJ, `createPartySchema`/`createBranchSchema`,
  endereço parcial recusado), `backend` 358→377 (20 unit + 357 e2e; +6 unit
  `CnpjLookupService` com `fetch` stubado, +13 e2e `party-branch-http.e2e-spec.ts`:
  401/400/409/404, CNPJ pontuado normaliza, endereço incompleto não bloqueia criação,
  CNPJ duplicado não colide entre tenants diferentes), `frontend` 6→6 (sem teste novo —
  verificação manual no navegador, mesmo critério da parte 2). Build e lint limpos nos
  três workspaces. Suíte e2e rodada contra `mash_test`; banco de DESENVOLVIMENTO
  confirmado intacto depois (tenants `smoke-test`/`smoke-test-2`, `OrderStatus`
  com 3 linhas, `Party` com 2 — nada perdido, D-051).

**Decisões tomadas que não estavam no pedido:**
- Componente `Dialog`/`DialogContent` genérico (`@radix-ui/react-dialog`, já dependência
  via `cmdk`/`CommandDialog`) — reaproveitado como base dos dois modais em vez de duplicar
  a estrutura de portal/overlay/content.
- `EntityCombobox` próprio em vez de `@radix-ui/react-popover` — dependência nova evitada
  (D-020/seção 3.1 CLAUDE.md: usar o que já existe); lista fecha por clique fora via
  listener de `mousedown` no documento, escopado a quando está aberto.
- `ApiError` (frontend) ganhou campo `body?: unknown` — sem isso o modal não tinha como
  ler `existingParty` do 409 pra oferecer "usar esta".
- Fix de foco: o fechamento automático do Radix Dialog restaura foco pro elemento que
  abriu o modal DEPOIS do `.focus()` manual do componente, então o Radix ganhava a
  corrida e o foco ia parar num link do menu lateral. Corrigido adiando o `.focus()` de
  volta pro combobox com `setTimeout(..., 0)`.
- Tenant `smoke-test-2` criado do zero pro teste de aceitação (em vez de apagar a `Party`
  já vinculada a um `Order` no `smoke-test` existente) — apagar quebraria integridade
  referencial de dado de sessão anterior cuja proveniência não é desta unidade (CLAUDE.md
  seção "executando ações com cautela").
- Backend tenta de novo sem `address` se o payload inteiro falhar a validação com
  endereço incluído — assim um endereço mal formado ou incompleto nunca bloqueia a
  criação da `Party` (a régua era "CNPJ nunca é requisito de bloqueio"; estendida aqui pra
  "endereço também não").
- Duplicidade de CNPJ detectada por `P2002` (código do Prisma pra violação de constraint
  única) dentro da transação, não por um `findFirst` antes de criar — evita corrida entre
  checar e criar.

**Fora do escopo, não construído (como pedido):** tela de cadastro completa de `Party`,
edição de `Party` existente, lista de partes, importação em massa.

## Unidade "vincular cliente à Quote (quem pediu a cotação)"

**Por quê:** sem saber quem pediu, uma cotação fechada não serve pra achar depois nem pra
ligar cobrando resposta — e a lista de cotações (próxima unidade) não tem por onde
filtrar/identificar cada linha.

**Investigado antes de modelar (como exigido):**
- `Quote` não tinha nenhum vínculo com `Party`.
- `Order.senderId`/`recipientId`/`tomadorId` são FKs simples pra `Party` (D-047), sem FK
  composta garantindo mesmo tenant — RLS resolve na prática. Segui o mesmo padrão.
- `Quote` tem `REVOKE UPDATE` geral desde a migração genesis; só colunas com `GRANT
  UPDATE` explícito são reescrevíveis depois de criadas (`statusId`/`updatedAt`,
  `icmsRateApplied`/`ibsRateApplied`/`cbsRateApplied`/`total`, `validUntil`, `quantity`).
- **Achado que exigiu parar:** o banco de desenvolvimento tinha 5 `Quote` existentes
  (contadas certo só via `mash_owner` — contá-las via `mash_app` sem contexto de tenant
  dá zero por causa do RLS, erro que cometi antes de notar). Todas caminho CUSTO, sem
  `freightRateId` pra derivar parte, todas dos tenants `smoke-test`/`smoke-test-2`
  (verificação em navegador de unidades anteriores). Parado e perguntado ao usuário antes
  de escolher nullable vs. backfill — decisão: apagar as 5 (com os 2 `Order`/6 `Trip`
  dependentes) e nascer `NOT NULL` sem backfill inventado.

**Pronto:**
- `Quote.partyId` (`schema.prisma`) — FK `NOT NULL` pra `Party`, nome/padrão igual a
  `FreightRate.partyId` (D-014), não `customerId`: já é como o repositório nomeia "a
  Party genérica de um registro". `ON DELETE RESTRICT` (mesmo tratamento de
  `Order.senderId`/`recipientId`/`tomadorId`) — apagar o cliente não pode apagar o
  histórico de cotação (D-017). Sem `GRANT UPDATE`: fica no mesmo regime de
  `icmsUf`/`marginPercentage`, gravável só no `INSERT`, nunca reescrito — não faz parte
  do congelamento de `close()` porque o cliente não muda o preço.
- Migração `20260911020000_add_quote_party` (`migrate diff --script` + `migrate deploy`,
  ambiente não interativo).
- `createCostBasedQuoteSchema` (`@mash/shared`) exige `partyId` (uuid) — schema de
  formulário (`quote-cost-based-form.schema.ts`) herda direto via `.extend()`, sem
  duplicar.
- `QuoteService.createCostBased()` recebe `partyId` e grava. `QuoteService.create()`
  (caminho TABELA) **deriva** de `freightRate.partyId` em vez de pedir de novo — uma
  `FreightRate` já é negociada com uma `Party` só (D-014), então quem pediu a cotação por
  tabela é necessariamente essa mesma parte.
- `GET /quotes/:id` passou a incluir `party: {id, name}` na resposta — parte do "estado
  completo da Quote" que o endpoint já promete, mesmo tratamento de `costType.name`.
- Tela `/cotacoes/nova-por-custo`: campo "Cliente" é o PRIMEIRO do formulário (foco
  inicial migrou de UF pra ele), reaproveitando o `EntityCombobox` e o `CreatePartyModal`
  da D-052 sem componente novo — mesmo padrão de "+ Criar cliente" do aceite.
- Testado no navegador: cotação montada escolhendo cliente existente OU criando um novo
  pelo modal (Esc antes de criar preserva UF/margem/linha de custo já preenchidos e não
  cria nada); cotação fechada e aceita com filial/remetente/destinatário/tomador —
  confirmado no banco que `Quote.partyId` (quem pediu) e `Order.tomadorId` (quem paga)
  são Party DIFERENTES na mesma operação, como o pedido exigia provar.
- Cabe em 1366×768 sem rolagem, inclusive com o campo Cliente novo — confirmado por
  iframe isolado.
- Sem migração de dado: as 5 `Quote` de teste conflitantes foram apagadas (decisão do
  usuário), não adaptadas.
- Suítes: `shared` 120→122 (+2: recusa sem `partyId`, recusa `partyId` não-uuid),
  `backend` 377→377 (nenhum teste novo — só fiação: toda `Quote` de teste ganhou uma
  `Party` e `partyId`; 20 unit + 357 e2e), `frontend` 6→6 (sem teste novo, verificação
  manual, mesmo critério das unidades anteriores). Build e lint limpos nos três
  workspaces. Suíte e2e rodada contra `mash_test` (precisou de `npm run db:test:setup`
  pra aplicar a migração nova lá também — sem isso a suíte falha com "column partyId does
  not exist", achado durante esta unidade). Banco de DESENVOLVIMENTO confirmado intacto
  depois: os mesmos 6 tenants, `Quote`/`Order`/`Party` batendo exatamente com o que esta
  sessão criou no teste de aceitação (nada de outra sessão foi perdido).

**Decisões tomadas que não estavam no pedido:**
- Nome do campo `partyId`/`party`, não `customerId` — seguindo o precedente exato de
  `FreightRate.partyId` já existente no repositório (D-007: convenção do repositório
  vence preferência pessoal).
- `QuoteService.create()` (caminho TABELA) deriva `partyId` de `freightRate.partyId` em
  vez de ganhar um parâmetro novo — evita pedir de novo um dado que a `FreightRate` já
  garante, e não exigiu tocar nenhum teste do caminho TABELA.
- `GET /quotes/:id` passou a devolver `party: {id, name}` — não pedido explicitamente,
  mas consistente com o resto do endpoint (nenhuma coluna nova de `Quote` ficou de fora
  da resposta "estado completo").
- Apagar as 5 `Quote` de teste do banco de desenvolvimento em vez de nullable/backfill —
  confirmado com o usuário antes de agir (ver "achado" acima).
- `@@index([tenantId, partyId])` em `Quote` — a lista de cotações que esta unidade
  destrava vai precisar filtrar por cliente; custo zero adicionar agora, na mesma
  migração que já toca a tabela.

**Fora do escopo, não construído (como pedido):** lista de cotações, tomador fiscal na
cotação, tela de cadastro completa.

## Unidade "lista de cotações" — primeira tela de chegada do sistema

**Por quê:** a D-053 destravou "achar a cotação depois" e "saber pra quem ligar quando o
prazo está vencendo" — sem lista, os dois continuam impossíveis. É também a primeira vez
que TanStack Table (D-021) é exercitado de verdade.

**Investigado antes de construir (como exigido):**
- `GET /quotes/:id` devolve `{id, createdAt, statusCode, party, isExpired, validUntil,
  icmsUf, marginPercentage, ..., total, quantity, costSubtotal, costLines[], order}` — a
  lista reaproveita os nomes que fazem sentido por linha (`id`, `createdAt`,
  `statusCode`, `isExpired`, `validUntil`, `party`, `total`), não inventa outros.
- **A premissa sobre a D-051 não correspondia ao código.** O texto dizia que `GET
  /parties`/`GET /branches` nasceram "com formato de resposta que comporta paginação
  depois sem virar mudança de contrato", mas os dois devolvem array bruto — um array não
  herda paginação sem quebrar quem já lê o array direto. Não existia formato nenhum pra
  reaproveitar. Relatado antes de codar; desenhado um novo (ver decisão abaixo).
- Colunas de `Quote` conferidas direto no schema antes de pedir qualquer campo.
- `pg_trgm` já habilitado (D-038), mas só indexado em `Order.customerReference` — sem
  índice em `Party.name`. Criado nesta unidade, mesmo padrão exato.

**Pronto:**
- Migração `20260911030000_quote_list_index_and_search`: `@@index([tenantId, statusId,
  validUntil])` (cobre filtro+ordenação da visão padrão juntos) e `Party_name_trgm_idx`
  (GIN trigram, mesmo padrão da D-038 — invisível ao `schema.prisma`, mesma razão que o
  índice do `customerReference` também é).
- `listQuotesQuerySchema` (`@mash/shared`) — `status` (cinco valores de FILTRO, não os
  quatro `QuoteStatus.code` reais: `CLOSED_EXPIRED` nunca é gravado, D-046), `partyId`,
  `q`, `page`/`pageSize` (`z.coerce.number()`, serve tanto o `req.query` do Nest — sempre
  string — quanto o `search` já tipado do TanStack Router).
- `QuoteService.list()` — visão PADRÃO (sem `status` na URL) é `CLOSED` + `validUntil`
  não vencido, ordenada por `validUntil` ASC (nulls last) e `createdAt` DESC como
  desempate — "o que está esperando resposta e vai vencer" primeiro, nunca a lista
  inteira por data de criação. `CLOSED_EXPIRED` traduz pra `statusId=CLOSED AND
  validUntil < agora` — nunca statusId próprio, nunca job periódico (D-046). Busca por
  cliente via `party.name.contains + mode:insensitive` (ILIKE acelerado pelo trigram).
  Filtro/busca/paginação inteiramente no servidor (`skip`/`take`), banco de teste
  confirma via 13 testes e2e novos (`quote-list-http.e2e-spec.ts`), incluindo RLS.
- `GET /quotes` — mesmo padrão de erro dos outros (`BadRequestException(zod.flatten())`),
  nasce com a tela (D-048), devolve `{items, total, page, pageSize}`.
- Tela `/` (antiga casca placeholder da D-049, agora removida — `home.tsx` apagado):
  cliente, preço final, estado, validade, criada em. Estado é o que organiza (cinco
  estados, "vencida" em vermelho — nunca lido do banco). Filtro por estado, filtro por
  cliente (`<select>`) e busca por texto (debounce 300ms) — os três no servidor, os três
  na URL (`page` reseta a 1 quando qualquer filtro muda). `@tanstack/react-table` v8
  (`useReactTable`/`getCoreRowModel`/`flexRender`) só pra estrutura de colunas — sem
  sort/filter/pagination embutidos do lado do cliente, os três já são do servidor.
- Teclado: setas (↑/↓) movem a linha ativa dentro de um container `role="table"` focável,
  Enter abre. Esqueleto no formato da tabela no carregamento inicial;
  `keepPreviousData` (TanStack Query) evita esqueleto piscando ao trocar página/filtro —
  a tabela anterior fica visível com um "Atualizando..." discreto até o novo dado chegar.
- Ctrl+K (D-048/D-049): grupo "Cotações" reaproveita o MESMO `GET /quotes` (`q` + 
  `pageSize: 5`), sem endpoint novo — `CommandDialog` ganhou um `shouldFilter` pra não
  deixar o filtro de texto embutido do `cmdk` brigar com resultado vindo do servidor.
- **Achado que bloqueava a própria métrica da unidade:** `AppLayout` usava `min-h-screen`
  (piso, não teto) e `<main>` sem `overflow` — nenhuma tela anterior tinha conteúdo alto
  o bastante pra expor isso (a página inteira crescia e ROLAVA JUNTO COM A SIDEBAR em vez
  de só a área de dado rolar). Corrigido pra `h-screen overflow-hidden` na casca e
  `min-h-0 flex-1 overflow-hidden` em `<main>` — cabeçalho/filtro/paginação ficam fixos,
  só as linhas da tabela rolam. Reconferido que `quote-cost-based`/`quote-detail`
  continuam cabendo em 1366×768 sem regressão.
- **14 linhas cabem em 1366×768 sem rolar** (medido: área de linhas com 506px de altura
  útil ÷ 36px por linha = 14 completas; a 15ª aparece cortada, acessível pela rolagem
  interna da tabela — só ela rola, não a tela toda).
- Suítes: `shared` 122→**129** (+7: `listQuotesQuerySchema`), `backend` 377→**390** (20
  unit + 370 e2e, +13 novos em `quote-list-http.e2e-spec.ts`), `frontend` 6→6 (sem teste
  novo, verificação manual). Build e lint limpos nos três workspaces.
- Testado no navegador, com teclado: 35 cotações criadas (via `fetch` autenticado no
  console, mesma sessão real — criar 35 clicando um SELECT por vez não testaria nada que
  os cliques em si já não provassem) cobrindo os cinco estados e mais de uma página;
  percorrida com ↑/↓, aberta com Enter, voltada com o histórico do navegador (filtro e
  página preservados pela URL); filtro por estado (Rascunho/Fechada/Fechada e
  vencida/Aceita/Recusada) e por cliente conferidos um a um; busca por "translog" achou
  só a Party certa; paginação (25 fechadas, pageSize 20) dividiu 20+5 sem repetir nem
  perder id; Ctrl+K achou cotação por nome de cliente e navegou certo.
- Banco de DESENVOLVIMENTO confirmado intacto depois da suíte e2e e do teste manual —
  contado como `mash_owner` (D-053: contar como `mash_app` sem tenant no contexto zera
  por RLS e engana).

**Decisões tomadas que não estavam no pedido:**
- Envelope `{items, total, page, pageSize}` pra `GET /quotes` — a D-051 não deixou nada
  reaproveitável de verdade (achado acima); aditivo por construção, campo novo depois não
  quebra quem já lê `items`/`total`.
- Paginação por página/tamanho com contagem total (`skip`/`take` + `count()`), não por
  cursor — "milhares" de cotações por ano não é a escala onde `OFFSET` degrada de forma
  que importe, e página/tamanho integra direto com `manualPagination` do TanStack Table
  sem inventar mecanismo de cursor que ninguém pediu.
- `@tanstack/react-table` fixado em v8 (`8.21.3`), não v9 (a mais nova, `9.2.4`) — a v9
  reescreveu a API inteira (`useTable`/`createTableHook`, arquitetura nova) e só mantém a
  API conhecida (`useReactTable`/`getCoreRowModel`) atrás de um import `/legacy`
  explicitamente marcado como legado. Começar o primeiro uso real da biblioteca já em
  cima do caminho "legado" não fazia sentido; v8 é madura, documentada, e é a API que o
  resto do ecossistema (exemplos, Stack Overflow, o que um desenvolvedor solo vai
  encontrar) ainda assume.
- `/` deixou de ser placeholder (D-049) e passa a ser a lista — não uma rota nova em
  `/cotacoes` com redirecionamento: "primeira tela de chegada" só faz sentido sendo
  literalmente o que `/` mostra, e o próprio comentário do `home.tsx` já antecipava essa
  substituição.
- Foco inicial no CONTAINER da tabela, não na busca — decisão explícita pedida no
  enunciado: esta é a primeira tela em que o operador chega sem saber o que quer (item
  5), então setas pra varrer a lista servem mais gente do que focar um campo de texto que
  só ajuda quem já sabe o nome do cliente.
- "Posição" preservada ao voltar (item 6) é só filtro+página, via URL — a linha ativa
  reseta pra topo a cada carregamento da lista, não persiste índice entre navegações: o
  dado pode ter mudado (a cotação que acabou de ser fechada/aceita não é mais a mesma
  linha na visão padrão), e o `staleTime` default (0) já refaz a busca ao voltar.
- Correção do `AppLayout` (`min-h-screen`→`h-screen`, `<main>` ganhou
  `overflow-hidden`) — não pedida, mas sem ela a própria métrica pedida (linhas em
  1366×768) não tinha resposta correta: a tela inteira rolava, não só a tabela.
- Extraídos `formatDate` (`lib/br-date.ts`) e `STATUS_TONE_CLASS` (`lib/status-tone.ts`)
  de dentro de `quote-detail.tsx`, que os tinha só localmente — segundo uso real, D-021
  antirredundância.

**Fora do escopo, não construído (como pedido):** lista por processo/pedido, edição em
linha, visões salvas por usuário, exportação, tela de cadastro completa.

## Unidade "papéis e permissões" — modelo, semente, e a casca respeitando

**Por quê:** pesquisa de mercado (ESL Cloud, Senior) — nenhum TMS de referência fixa
papel no código; todos entregam usuário → grupo → permissões, com grupos semeados que
cada transportadora altera, exclui ou duplica, e um marcador de administrador que ignora
tudo. Revisa na prática a D-009 ("papel simples no usuário, matriz configurável é
camada 3") — a matriz sobe pra agora.

**Investigado antes de modelar (como exigido):**
- `User.role: UserRole` (enum OPERATOR/MANAGER/FINANCE/ADMIN) já existe (D-009), viaja
  até a sessão e o CLS (`tenant.guard.ts`), mas **nunca é lido por nenhuma decisão de
  autorização** — `grep` em `src/` só acha atribuição, nunca leitura condicional.
  Rudimentar e inerte, exatamente o "papel fixo no código" que a pesquisa mostra
  abandonado. Não removido: apagaria/tocaria ~8 arquivos de teste que criam `User` só
  por um campo que hoje não faz nada — fora do pedido desta unidade, fica como achado.
- `GET /me` devolvia só `id/name/email/role/tenant`; `GET /me/users` é "superfície
  mínima pra provar RLS" (comentário do próprio código), não a tela de gerenciar
  usuários.
- Guarda de rota hoje: `TenantGuard` global (`APP_GUARD`), allowlist por
  `@Public()`/`Reflector` — sem `@Public()`, exige sessão válida; não existia noção de
  permissão nenhuma além disso.
- 18 endpoints reais existentes, inventariados um a um antes de decidir qual permissão
  cada um ganha (lista completa abaixo).

**Pronto:**
- Migração `20260912000000_add_group_permission_model`: `Permission` (catálogo
  GLOBAL, sem `tenantId` — mesmo tratamento de `TaxRate`, `USING(true)`, `INSERT`/
  `UPDATE`/`DELETE` revogados de `mash_app`), `Group` (pertence ao tenant, `tenantId`
  `NOT NULL` — decisão abaixo), `GroupPermission` (join table, `tenantId` próprio,
  mesmo critério de toda tabela filha tenant-scoped), `User.groupId` (anulável) e
  `User.isAdmin` (`DEFAULT false`).
- 9 permissões semeadas, derivadas do que existe hoje:
  - `QUOTE`: `quote.view`, `quote.create`, `quote.close`, `quote.accept`,
    `quote.reject` — os cinco verbos do ciclo de vida da cotação (D-046/D-047).
  - `REGISTRATION`: `registration.view`, `registration.create` — "partes e filiais" como
    um domínio só (o pedido bundla os dois), cobre `Party` e `Branch` juntos.
  - `TENANT_SETTINGS`: `settings.view`, `settings.change` — sem endpoint ainda (a
    próxima unidade constrói a tela), semeadas agora pra ela nascer protegida.
- Todos os 18 endpoints reais ganharam `@RequirePermission(code)` ou
  `@NoPermissionRequired()` — nenhum ficou sem decisão. `PermissionGuard` (novo,
  segundo `APP_GUARD`, roda depois do `TenantGuard`) lança
  `InternalServerErrorException` se nenhum dos três marcadores
  (`@Public()`/`@RequirePermission()`/`@NoPermissionRequired()`) existir — testado por
  unidade (`permission.guard.spec.ts`), não só por convenção.
- `SessionService.validate()` (já reconsultava `User` a cada requisição pra derrubar
  sessão de usuário inativado, D-048) passou a resolver `isAdmin`/`permissions`
  efetivas na MESMA consulta — sem round-trip extra. `isAdmin=true` resolve como "todo
  código do catálogo", não um caso especial espalhado pelo guard.
- `GET /me` devolve `isAdmin` + `permissions` (lista já resolvida — `isAdmin` já vira a
  lista completa, a casca faz uma pergunta só).
- Grupos "Operador" (7 permissões, tudo menos `settings.*`) e "Gestor" (9, tudo) nascem
  DENTRO de cada tenant via `TenantsService.seedDefaultGroups()`, chamado por
  `create()` (tenant novo, mesma transação que já cria a filial padrão, D-030) — não
  duas linhas globais. Tenants que já existiam ganharam os grupos via
  `scripts/backfill-tenant-groups.mjs` (roda uma vez, fora da migração — D-015 exige
  UUID v7 gerado na aplicação, `gen_random_uuid()` no SQL geraria v4).
- Todos os `User` que já existiam viraram `isAdmin=true` no backfill da migração —
  preserva o acesso que já tinham (irrestrito) em vez de reduzir a zero por falta de
  grupo. Usuário novo nasce sem grupo e sem admin — "sem acesso" é o estado explícito.
- Casca esconde (item 5): sidebar mostra "Início"/"Cotação por
  custo"/"Configuração" condicionados a `quote.view`/`quote.create`/`settings.view`,
  com esqueleto enquanto a sessão carrega (nunca ausência súbita). Botões
  Fechar/Aceitar/Recusar em `quote-detail.tsx` condicionados a
  `quote.close`/`quote.accept`/`quote.reject`. `EntityCombobox` ganhou
  `onRequestCreate` OPCIONAL — sem `registration.create`, o "+ Criar" simplesmente não
  renderiza (esconder, não desabilitar, o pedido).
- Placeholder `/configuracoes` (mesmo critério de `home.tsx` antes da D-054) — a tela
  de verdade é a próxima unidade; o que existe agora é só o necessário pra
  `settings.view` ter algo concreto pra esconder/mostrar.
- Suítes: `shared` 129 (inalterado — só um vocabulário de códigos, sem schema Zod
  novo), `backend` 27 unit + 391 e2e = **418** (377→418: +7 unit
  `permission.guard.spec.ts`, +21 e2e: 4 novos em `tenant-provisioning`, 9 em
  `group-permission-rls`, 8 em `permission-enforcement-http`), `frontend` 6
  (inalterado, verificação manual). Build/lint limpos nos três workspaces.
- Fiação: 7 pontos em 5 arquivos e2e (`isAdmin: true` nos usuários de teste que não são
  sobre permissão) — nenhuma asserção mudou.
- No navegador: operador vê sidebar sem "Configuração"; gestor vê "Configuração" e
  abre o placeholder. Backend recusa de verdade testado por HTTP direto (não só tela
  escondida): usuário sem grupo recebe 403 em `POST /quotes/cost-based`, `GET
  /parties`, `GET /branches`; `isAdmin=true` sem grupo nenhum passa em tudo.
- Banco de DESENVOLVIMENTO confirmado intacto depois da suíte e2e, contado como
  `mash_owner` (D-053): 6 tenants preservados, 12 `Group`/96 `GroupPermission`/9
  `Permission`, `Quote`/`User` batendo com o que esta sessão criou.

**Modelagem comporta filial depois, sem remodelar (pergunta explícita do pedido):** sim.
Tenant (RLS, "quais dados existem") já é ortogonal a Group/Permission ("o que se pode
fazer", D-009) — filial seria um TERCEIRO eixo do mesmo jeito, um `branchId` anulável em
`User` (ou em `Group`), sem tocar `Permission`/`Group`/`GroupPermission`. Nenhuma FK nova
entre `Group` e `Branch` seria necessária.

**Como garanti que endpoint sem permissão declarada não passa livre:** `PermissionGuard`
lança erro se nenhum dos três marcadores existir — testado (`permission.guard.spec.ts`,
o teste "rota sem @Public()... lança erro de programação"). Como TODOS os 18 endpoints
reais já foram decorados, não há hoje uma rota real pra provar isso por HTTP sem
adicionar um controller só pro teste — cobertura ficou no nível de unidade, deliberado
(ver "Não verificado" no relatório da execução).

**Decisões tomadas que não estavam no pedido:**
- `pickup-order-http` (`GET /pickup-orders/:id/pdf`) não está nos três domínios que o
  pedido lista (cotação/cadastro/configuração) — reaproveitou `quote.view` ("o fluxo
  comercial inteiro", item 3), não ganhou módulo próprio pra um endpoint só.
- `GET /quote-cost-types` e `GET /tax-rates/quote-preview` (auxiliares do formulário de
  montar cotação) reaproveitaram `quote.create` — só alcançáveis de dentro daquele
  fluxo, nunca isolados.
- `GET /parties/cnpj/:cnpj` (consulta auxiliar da D-052) reaproveitou
  `registration.create` pelo mesmo motivo.
- `GET /me` e `GET /me/users` viraram `@NoPermissionRequired()`, não uma permissão de
  negócio — identidade, não capacidade; `POST /auth/logout` também.
- Paginação/página/tamanho não é o que muda aqui, mas a mesma régua de "todo endpoint
  precisa de decisão" levou a criar `@NoPermissionRequired()` como terceiro marcador —
  não pedido explicitamente, mas sem ele `/me` teria que inventar uma permissão falsa
  ou virar um caso especial escondido dentro do guard.
- `EntityCombobox.onRequestCreate` virou opcional (era obrigatório) — mudança mínima
  pra "esconder, não desabilitar" funcionar sem duplicar o componente.
- `scripts/backfill-tenant-groups.mjs` — não pedido nominalmente, mas necessário: sem
  ele, os 6 tenants que já existiam nunca ganhariam Operador/Gestor, e "gestor: tudo do
  operador mais configuração" ficaria sem verificação possível nesta sessão.

**Não verificado:** cobertura HTTP de "endpoint sem permissão declarada" (só unitária,
ver acima); "não deixar o tenant sem nenhum admin" (a Senior provavelmente impede
remover o último admin — não construído, não existe tela de gerenciar usuário ainda
pra isso importar); permissão por filial (fora de escopo, só confirmado que comporta).

**Fora do escopo, não construído (como pedido):** tela de gerenciar grupos e usuários,
alçada por valor, permissão por filial, dashboard, visibilidade financeira.

## Unidade "configuração do tenant" — prazo padrão de validade da cotação

**Por quê:** `close(quoteId, options?)` aceitava prazo omitido e a cotação nunca
expirava — o padrão inseguro silencioso da D-046 (quem esquece não recebe erro, recebe
cotação imortal). A tela já exigia prazo desde a D-051, mas o backend não; qualquer outro
caminho (script, integração) reabria o buraco.

**Investigado antes de construir (como exigido):**
- Nenhuma tabela/coluna de configuração de tenant existia — confirmado por `grep` em
  `schema.prisma`; primeira (D-020 já previa um `SettingsService`, nunca construído).
- `computeQuoteValidUntil(referenceDate, term)` (`shared/src/quote-validity/`) aceitava
  só `{unit: 'DAYS'|'MONTHS', amount}`.
- 11 chamadas a `close()` sem `validityTerm` (produção zero — só testes: 2 em
  `order-pricing`, 2 em `quote-cost-based`, 5+2 em `quote-lifecycle` [5 sem termo, 2 com
  termo real], 2 em `quote-accept-creates-order`). Esse número (chamadas que OMITIAM o
  prazo) não é o mesmo que "total de call sites que precisaram de edição" — ver abaixo.
- `/configuracoes` (D-055) só tinha um texto fixo "nenhuma tela ainda existe" — nenhuma
  leitura/escrita de configuração implementada.

**Pronto:**
- `QuoteValidityTerm` ganhou `'YEARS'` — internamente 1 ano = 12 meses, reaproveitando a
  MESMA regra de grudar no último dia do mês (`computeQuoteValidUntil`, sem duplicar
  lógica). Teste explícito: 29/02/2028 + 1 ano gruda em 28/02/2029 (não vira data
  inexistente); + 4 anos cai em 29/02/2032 (bissexto de novo, o dia existe, não gruda).
- `QuoteValidityDecision` (`@mash/shared`) — `{type:'TERM', term} | {type:'NEVER'}` —
  schema único usado tanto no fechamento de UMA cotação quanto na configuração do
  padrão do tenant, porque é a mesma pergunta nos dois lugares.
- `TenantSettings`: tabela dedicada (não colunas em `Tenant`, que já carrega config
  FISCAL — assunto diferente; não key-value genérico, só existe UM campo hoje).
  `defaultQuoteValidityUnit` nulo = ninguém configurou (linha nem existe — nasce só no
  primeiro save, mesmo padrão de `CarrierProfile`/D-032, nunca auto-criada com o
  tenant); `unit='NEVER'` = "não vence" explícito; `DAYS`/`MONTHS`/`YEARS` = prazo. CHECK
  `TenantSettings_quote_validity_shape` garante as 3 combinações válidas (unit nulo +
  amount nulo / NEVER + amount nulo / prazo + amount>0), guardado contra NULL (D-043).
  RLS padrão (D-012). Migração `20260912010000_add_tenant_settings`, aplicada em `mash`
  e `mash_test`.
- `close()` (`QuoteService`) — `options.validity` agora OBRIGATÓRIO no tipo (sem `?`);
  omitir na chamada direta estoura em runtime (`options.validity.type` de `undefined`).
  No HTTP, `closeQuoteSchema.validity` (Zod, `@mash/shared`) recusa com 400 antes de
  chegar no serviço.
- `GET/POST /tenant-settings` atrás de `settings.view`/`settings.change` (D-055) —
  guarda no backend, testado por HTTP direto (403 pra operador, 200 pra gestor).
- Prefill do fechamento: `GET /me` (sem exigir permissão) passou a devolver
  `tenant.defaultQuoteValidity` — decisão deliberada de NÃO gatear atrás de
  `settings.view`, porque quem fecha cotação (`quote.close`) é o operador do dia a dia,
  não necessariamente quem administra a configuração. `settings.view`/`settings.change`
  continuam protegendo só a TELA de gerenciar, não o valor em si (que já não era
  segredo — mesmo tratamento do nome do tenant, já devolvido em `/me` sem permissão).
- Lista (D-054): `CLOSED` passou a significar `validUntil >= now` (excluindo nulo, era
  um `OR` com nulo antes); `CLOSED_NO_EXPIRY` (novo) é `validUntil IS NULL`;
  `CLOSED_EXPIRED` inalterado. Confirmado que nulo não cai em nenhum dos dois por
  acidente: os operadores `{gte}`/`{lt}` do Prisma nunca comparam verdadeiro contra
  NULL em SQL — não foi acidente, foi verificado.
- Tela de fechar cotação e tela de configuração do tenant reaproveitam o MESMO módulo
  de schema (`quote-close-form.schema.ts`) — unidade DAYS/MONTHS/YEARS/NEVER, "não
  vence" como opção do mesmo seletor, nunca um checkbox à parte.
- Suítes: `shared` **139** (129→139: +10, unidade YEARS + decisão + settings schema),
  `backend` 27 unit + **400** e2e = **427** (418→427: +9 e2e — 2 filtro
  `CLOSED_NO_EXPIRY`/visão-padrão em `quote-list-http`, 4 RLS em
  `tenant-settings-rls`[novo arquivo], 2 permissão em `permission-enforcement-http`, 1
  "close() sem decisão é recusado" em `quote-lifecycle`), `frontend` 6 (inalterado).
  Build/lint limpos nos três workspaces.
- No navegador: operador não vê "Configuração" na sidebar; gestor vê, configura 15
  dias, salva ("Configuração salva."); nova cotação do gestor chega com "15"/"dias"
  pré-preenchidos no fechamento, editável (trocado pra 20 e fechado — "Fechada, válida
  até 02/10/2026", a data certa pros 20 dias). Cotação fechada com "Não vence" mostra
  "Fechada — sem prazo" no detalhe, aparece no filtro "Sem prazo" da lista e NÃO
  aparece na visão padrão (só "Fechada", que agora é estritamente "vai vencer").
- Banco de DESENVOLVIMENTO confirmado intacto depois da suíte e2e e da verificação
  manual, contado como `mash_owner` (D-053): 6 tenants, 6 usuários (2 novos criados
  só pra este teste manual — `operador-config@browser.com`/`gestor-config@browser.com`
  no tenant "Smoke Test"), 38 `Quote`, 1 `TenantSettings`.

**Fiação:** 11 chamadas a `close()` que omitiam prazo precisaram de decisão explícita
(`{validity:{type:'NEVER'}}` nos testes que não testam validade em si). MAS o número
real de call sites tocados foi maior: a troca de nome do campo (`validityTerm` →
`validity`, e a forma que passou a ser `{type,...}` em vez de termo puro) quebrou TODA
chamada que já passava um termo real também — mais 9 sites em 2 arquivos
(`quote-lifecycle-http`: 8 corpos HTTP; `quote-list-http`: 1 helper). "11 chamadas sem
prazo" (da investigação) não é o mesmo número que "total de sites editados" — relatado
aqui explicitamente pra não confundir os dois.

**Decisões tomadas que não estavam no pedido:**
- Redefinir a visão PADRÃO (sem filtro) da lista pra excluir "sem prazo" — a D-054 já
  define o propósito da visão padrão como "o que vai vencer"; uma cotação que nunca
  vence não tem urgência ali. Comportamento novo em relação à unidade anterior — quem
  quiser ver "sem prazo" seleciona o filtro explicitamente.
- `GET /me` ganhou `tenant.defaultQuoteValidity` sem exigir `settings.view` (detalhado
  acima) — dois caminhos deliberadamente distintos: `/me` pra prefill universal,
  `/tenant-settings` pra tela de gerenciar.
- Renomear a descrição do teste `'close() sem prazo deixa validUntil nulo...'` pra
  `'close() com "não vence" explícito deixa validUntil nulo...'` em
  `quote-lifecycle.e2e-spec.ts` — só o texto, a asserção (`toBeNull()`) não mudou;
  "sem prazo" deixou de existir como conceito (agora é decisão explícita).
- `fieldErrors.validityTerm` → `fieldErrors.validity` em
  `quote-lifecycle-http.e2e-spec.ts` — mudança mecânica decorrente do próprio rename de
  campo do contrato (`validityTerm`→`validity`), não uma mudança de regra testada.
- `quote-close-form.schema.ts` (frontend) virou módulo compartilhado entre a tela de
  fechar cotação e a tela de configuração do tenant — não um arquivo novo por tela, a
  pergunta é idêntica nos dois lugares.

**Não verificado:** nenhum item do pedido ficou sem endereçar.

**Fora do escopo, não construído (como pedido):** gerenciar grupos e usuários, qualquer
configuração além do prazo padrão de validade.

## Unidade "datas na viagem" — origem e janela nas duas pontas da `Trip`

**Por quê:** as três perguntas de negócio que bloqueavam isso (origem derivada sem existir
em lugar nenhum pra primeira perna, formato de horário de funcionamento de `Address`,
devolução de vazio como ocorrência ou entidade nova) foram respondidas com o sócio.
`Trip` continuava sem nenhuma coluna de data — lacuna já registrada na D-047 como "última
antes da primeira tela".

**Investigado antes de modelar (como exigido):**
- `Trip` hoje (`backend/prisma/schema.prisma:1180`): tinha `destinationAddressId` (anulável
  desde D-047) e **nenhuma coluna de data**. `sequence` (D-037) é atribuído direto pela
  aplicação em `quote.service.ts:302` (`for (let sequence = 1; sequence <= quote.quantity;
  sequence += 1)`), sem `DocumentCounter` — não é numeração de negócio, é ordem interna.
- **O encadeamento "destino da N = origem da N+1" (D-037) não tinha NENHUMA implementação
  de código até esta unidade** — achado que não estava no pedido. O único lugar que cria
  múltiplas `Trip` de uma vez (`createOrderFromQuoteInTransaction`,
  `quote.service.ts:293-314`) cria uma `Trip` por unidade de `quote.quantity` (contêineres,
  não pernas de transbordo) e nunca toca em endereço — as três (`destinationAddressId`/
  `driverId`/`vehicleId`) sempre nascem nulas (D-047), preenchidas só na operação depois.
  A regra de encadeamento existia apenas como intenção registrada na D-037, nunca como
  derivação em runtime. **Conclusão: `Trip.originAddressId` não conflita com nada
  existente** — não havia necessidade de parar (a condição que pediria isso, comentário 1
  do pedido).
- **`Address.partyId` já era `NOT NULL` desde a criação da tabela**
  (`20260904070857_add_customer_address`, então `Customer`) — o pedido descrevia "Address
  ganha dono" como se dono fosse novo; na verdade é o oposto: hoje TODO endereço já
  pertence a uma `Party` (endereço do cadastro do cliente), e a mudança real foi
  **remover** essa obrigatoriedade, não adicioná-la, pra permitir o endereço esporádico
  sem dono. Único lugar do código que cria `Address` fora de teste
  (`party.controller.ts:96-105`) sempre passa `partyId` — nenhum caminho de produção
  dependia da obrigatoriedade pra funcionar, então relaxar não quebrou nada.
- Padrão exato das cinco colunas de janela de `PickupOrder` (D-045,
  `20260910000000_add_day_period_and_pickup_time_window`) conferido linha a linha antes de
  replicar: hora como `VARCHAR(5)` texto (não `time` nativo), `endsNextDay` em vez de
  segunda data, cinco `CHECK` com guarda explícita de `NULL` em cada comparação.
- `OccurrenceType`: só `DELAY`/"Atraso" (público) e `COMMERCIAL_HOLD`/"Retenção comercial"
  (interno) semeados (`20260907000258_add_occurrence`) — confirmado por leitura da
  migração antes de escrever o `INSERT` novo.
- **Achado que não estava no pedido:** `PickupOrder` já tem um campo `businessHours`
  (texto livre, `20260907051937_add_pickup_order`) — não em `Address`, mas exatamente o
  precedente de formato pra "horário de funcionamento" que o pedido pedia pra relatar.
  Reaproveitado o mesmo formato (texto livre) em vez de inventar um novo — ver decisão
  abaixo.

**Pronto** (migração `20260912020000_trip_origin_and_time_windows`, `migrate diff
--from-config-datasource --to-schema=prisma/schema.prisma --script` + edição à mão +
`migrate deploy`, ambiente não interativo, mesmo fluxo da D-045):
- `Address.partyId` virou anulável; FK manteve `ON DELETE RESTRICT` explícito no schema
  (`onDelete: Restrict` — sem isso o Prisma troca sozinho pra `SET NULL` ao tornar a FK
  opcional, o que mudaria comportamento: apagar uma `Party` referenciada por endereço
  passaria de bloqueado para silenciosamente órfão). `Address.businessHours` (texto livre,
  mesmo formato de `PickupOrder.businessHours`) — não reforçado por `CHECK`, convenção de
  preenchimento (só faz sentido com `Party` dona), não invariante do banco.
- `Trip.originAddressId` (anulável, FK `ON DELETE SET NULL`, mesmo tratamento de
  `destinationAddressId`) + dez colunas de janela estruturada, cinco em `origin*` e cinco
  em `destination*`, **formato IDÊNTICO à D-045** (`originDate`/`originStartTime`/
  `originEndTime`/`originEndsNextDay`/`originDayPeriodId`/`originTimeNote`, espelhado em
  `destination*`). Dez `CHECK` (cinco por ponta, mesma redação da D-045 com o prefixo
  trocado), cada comparação com `NULL` guardada explicitamente. Precisão continua derivada
  por `precisionOf()` (`@mash/shared`), nunca gravada — nenhuma coluna nova de precisão.
- `OccurrenceType` ganhou `EMPTY_RETURN`/"Devolução de vazio" (`INSERT`, não migração de
  tipo) — `isPublic = FALSE`, confirmado com o sócio depois do relato desta unidade:
  devolução de vazio é operação interna entre transportadora e armador, o embarcador não
  acompanha, e é onde o demurrage aparece — expor atraso de devolução ao cliente expõe um
  custo que pode virar discussão comercial. Exposição é caminho sem volta (fechado agora
  abre depois; aberto agora, alguém já viu), e o portal do embarcador é v1.1 de qualquer
  forma (D-010/D-039). Corrigido depois do relato inicial (que tinha `isPublic = TRUE`,
  suposição do agente não verificada) — migração já aplicada editada e `UPDATE` corretivo
  rodado em `mash` (1 linha; `mash_test` já não tinha a linha por causa do `TRUNCATE
  ... "Tenant" CASCADE`, ver abaixo), checksum em `_prisma_migrations` realinhado à mão
  nos dois bancos (mesmo procedimento da D-038/D-047).
- Nenhuma coluna de transbordo especial — o ponto do meio de um encadeamento (D-037) é só
  destino da perna N e origem da perna N+1, cada `Trip` com sua própria janela.
- `test/trip-time-window-check.e2e-spec.ts` (novo, 39 testes: 19 por ponta × 2 pontas,
  parametrizado por `describe.each(['origin','destination'])` em vez de arquivo duplicado
  — a regra é idêntica dos dois lados — mais 1 teste de transbordo) — os dez `CHECK`
  barrados por fora do serviço (Prisma admin direto), mesmo critério da D-045, e a prova
  de crossdock pedida: duas `Trip` encadeadas compartilhando o mesmo `Address` (destino da
  perna 1 = origem da perna 2), com janela de chegada (`destinationStartTime`/`EndTime` da
  perna 1) e de saída (`originStartTime`/`EndTime` da perna 2) diferentes, sem nenhuma
  coluna ou lógica específica de transbordo.
- `test/address-owner.e2e-spec.ts` (novo, 4 testes) — endereço sem dono aceito (`partyId`
  nulo), endereço com dono carrega `Party` identificável (não texto livre), `partyId`
  inexistente recusado pela FK, `businessHours` persiste mesmo sem dono.
- `test/helpers/seed-occurrence-types.ts` ganhou `EMPTY_RETURN` na lista reseeded (mesmo
  problema já documentado na D-045 pro `DayPeriod`: `TRUNCATE ... "Tenant" CASCADE` varre
  as linhas com `tenantId IS NULL` da migração — confirmado batendo o `SELECT` direto:
  `mash` tinha a linha logo após o `migrate deploy`, `mash_test` já estava sem ela depois
  da suíte e2e rodar uma vez, porque nenhum helper resemeava). `occurrence-type-rls.
  e2e-spec.ts` atualizado de `['COMMERCIAL_HOLD','DELAY']` pra incluir `EMPTY_RETURN`.
- Suítes: `shared` **139** (inalterado, nenhum código de `@mash/shared` tocado), `backend`
  27 unit + **443** e2e = **470** (427→470: +43 — 39 em `trip-time-window-check` + 4 em
  `address-owner`), `frontend` 6 (inalterado, unidade é só backend). Build e lint
  (`oxlint`) limpos. Migração aplicada em `mash` e `mash_test` (`npm run db:test:setup`
  depois do `migrate deploy` — sem isso a suíte e2e falha com "column Address.businessHours
  does not exist", achado durante esta unidade, mesmo padrão já visto na D-053).

**Decisões tomadas que não estavam no pedido:**
- `Address.party` com `onDelete: Restrict` explícito no schema — sem isso o Prisma
  trocaria sozinho pra `SET NULL` (comportamento novo, não pedido) só porque a FK virou
  anulável; mantido o comportamento que já existia.
- `businessHours` como texto livre em `Address`, mesmo formato de
  `PickupOrder.businessHours` já existente — o pedido pedia pra "relatar o formato
  escolhido e por quê"; a resposta é que o formato já tinha precedente no próprio repo
  (CLAUDE.md 3.1, antirredundância) e a mesma justificativa da D-034 se aplica (seção
  1.6 — formato varia demais entre terminais/portos pra fixar regra).
- `describe.each` parametrizando os testes de `origin`/`destination` em vez de duplicar o
  arquivo da D-045 — as duas pontas têm exatamente a mesma regra; duplicar por cópia
  violaria antirredundância (CLAUDE.md 3.1) sem ganhar nada em clareza.

**Não verificado:**
- `prisma migrate reset --force` (provaria a migração aplicando limpa contra banco vazio,
  do zero, mesmo critério da D-045) — não executado nesta sessão, exige consentimento
  explícito do usuário a cada execução (CLAUDE.md seção 2). Migração verificada por
  `migrate deploy` incremental em `mash` e `mash_test`, não por reset.

**Fora do escopo, não construído (como pedido):** descer a janela de coleta de
`PickupOrder` pra `Trip`, lista por processo, free time e demurrage, qualquer tela, e o
que a própria unidade descartou deliberadamente — validação de janela contra
`Address.businessHours`, hierarquia de terminal/sub-terminal, qualquer coisa específica de
transbordo (o teste de crossdock prova que não precisa de nada específico).
