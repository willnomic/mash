# Estado da construção

Snapshot do que existe, não do plano. Contexto do projeto em `contexto.md`, decisões em
`decisoes.md`. Atualizar ao fim de cada etapa concluída — se este arquivo e o código
divergirem, o código vence, e o arquivo está desatualizado.

Atualizado em 09/09/2026, commit `bb9578a` (D-034 a D-041 já em `master`) + trabalho desta
sessão: D-042 (faturamento e contas a receber — revisa D-025: `Invoice`/`Boleto`/
`ReceivableEvent`/`Attachment`, `Order.invoiceId`, `Party.invoicingPreference`), D-043
(corrige um erro da D-041 — IBS/CBS somavam ao preço sem condição; correto é não compor
durante a calibragem de 2026 — e amplia `TaxRate` com os três casos de ICMS,
`IbsCbsTaxSituation`, e três colunas reservadas em `Tenant` pra regime tributário, com
base em consulta contábil registrada em `docs/consulta-tributaria-2026-09.md`), e D-044
(provedor de documento fiscal avaliado em homologação e escolhido — Focus NFe — sem
adaptador construído ainda; evidência em `docs/RESULTADO.md`/`docs/CAMPOS-FALTANTES-MASH.md`).

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

## Testes: 286 passando (5 arquivos/22 unitários + 55 arquivos/264 e2e), zero mock de banco

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
| PDF real (não mock): 1 item cabe em 1 página; 40 itens produzem mais de uma página sem sobrepor nem cortar texto, todos os 40 presentes no texto extraído de volta com `pdf-parse`, cabeçalho "(continuação)" bate com o total de páginas menos uma; `UPDATE`/`DELETE` recusados em `PickupOrder` e `PickupOrderItem` | `pickup-order-pdf.e2e-spec.ts` |
| Rota `GET /pickup-orders/:id/pdf` ponta a ponta (sem token → 401, com token → PDF com `Content-Type` correto, token de outro tenant não vaza PDF alheio) | `pickup-order-http.e2e-spec.ts` |
| RLS de `DocumentCounter` | `document-counter-rls.e2e-spec.ts` |
| Numeração (D-015): sequencial em criações sucessivas; unicidade de `(tenantId, branchId, number)` garantida no banco; `DocumentCounter` libera só `UPDATE` de `lastNumber`, `DELETE` recusado; rollback depois de pegar o número não desperdiça o número (reaproveitado na próxima criação real); **concorrência real** — 10 criações simultâneas via `Promise.all` produzem 10 números distintos sem buraco, com contenção de lock observada de verdade em `pg_stat_activity` (não só resultado correto por acaso) | `order-numbering.e2e-spec.ts` |
| Guarda: `TenantPrisma.transaction()` continua protegido por RLS (D-012, D-035) — leitura via `tx.<model>` e via `tx.$queryRaw` não vazam tenant, escrita no tenant alheio recusada, duas `transaction()` concorrentes de tenants diferentes não se misturam, e o contexto de tenant não vaza pra próxima conexão do pool depois que a transação termina | `tenant-prisma-transaction-rls.e2e-spec.ts` |
| RLS de `Invoice`, `UPDATE`/`DELETE` recusados (nenhuma coluna liberada), `Order.invoiceId` alcançável a partir do pedido (D-038/D-042) | `invoice-rls.e2e-spec.ts` |
| RLS de `Boleto`, mais de um boleto por fatura aceito (1:N), valor zero/negativo recusado, `UPDATE`/`DELETE` recusados (D-042) | `boleto-rls.e2e-spec.ts` |
| RLS de `ReceivableEvent`, valor zero/negativo recusado, `CHECK` amarra `REVERSAL`↔`reversesReceivableEventId` nos dois sentidos, duplo estorno recusado, `UPDATE`/`DELETE` recusados, saldo por `SUM` de eventos com e sem estorno (D-042) | `receivable-event-rls.e2e-spec.ts` |
| RLS de `Attachment`, "download" de outro tenant recusado na consulta que qualquer URL assinada futura precisaria fazer primeiro, dois `ownerType` diferentes (`TRIP`/`BOLETO`) aceitos, `UPDATE`/`DELETE` recusados (D-042) | `attachment-rls.e2e-spec.ts` |
| Decimal (unitário — sem banco): operador nativo concatena, `.plus()`/`.minus()` somam/subtraem certo na soma sinalizada de `ReceivableEvent` (PAYMENT soma, REVERSAL desfaz), D-013 (D-042) | `receivable-decimal.spec.ts` |
| Regime tributário de `Tenant` nasce nulo (assento reservado), aceita ser preenchido com `incomeTaxRegime`/`isSimplesIcmsContributor`/`ibsCbsApurationRegime` (D-043) | `tenant-rls.e2e-spec.ts` |

Comando: `npm run test:e2e` (unitário: `npm test`), dentro de `backend/`.

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
  controle de versão). Banco novo exige `npx prisma migrate deploy` (28 migrações) antes
  da suíte e2e — sem isso os testes falham por schema ausente, não por RLS.
- **`pdfkit`/`pdf-parse` instalados nesta sessão** (D-034) — mesmo `--legacy-peer-deps`
  do `nestjs-cls`, nenhuma vulnerabilidade nova no `npm audit` (as 4 de alta severidade
  continuam as mesmas do CLI do Prisma, já registradas acima). `@types/pdf-parse` foi
  instalado por engano (a v2 do `pdf-parse` é reescrita como classe e publica os
  próprios `.d.ts`; o pacote de tipos era pra API antiga da v1) e removido no mesmo
  passo — não sobrou no `package.json`.
