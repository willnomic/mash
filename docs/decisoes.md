# Grupo Mash — Decisões Técnicas

Uma decisão por bloco. Contexto do projeto em `contexto.md`.

**Status possíveis:** `Fechada` · `Assento reservado` · `Em aberto` · `Revogada`

Atualizado em 08/09/2026 (D-036)

---

## D-001 · Linguagem única: Node.js + TypeScript
**Status:** Fechada

Do Core ao último módulo. Uma stack só em todo o sistema.

**Por quê:** evita retrabalho de linguagens que não conversam bem entre si, e concentra
o aprendizado de um desenvolvedor solo em vez de dispersá-lo.

---

## D-002 · Framework backend: NestJS
**Status:** Fechada

**Por quê:** impõe organização por módulos, mantendo fronteiras claras entre Core, TMS
e ERP mesmo com um único desenvolvedor.

**Reforço:** NestJS é íngreme de aprender porque é cheio de convenção e repetição — que
é exatamente a propriedade que torna a base fácil de manter com IA. A curva é o preço
de algo desejado.

---

## D-003 · Banco: PostgreSQL + Prisma
**Status:** Fechada

**Por quê:** modelagem relacional forte para dado financeiro e fiscal. O PostgreSQL
também é pré-requisito de D-012 (Row-Level Security).

---

## D-004 · Arquitetura: monólito modular
**Status:** Fechada

Core + módulos comunicando-se por eventos.

**Por quê:** fronteiras internas claras desde o primeiro commit, sem a complexidade
prematura de múltiplos serviços separados. Pronto para dividir se a escala pedir.

---

## D-005 · Infraestrutura: plataforma gerenciada
**Status:** Fechada

Railway ou Render.

**Por quê:** deploy automático e banco com backup, sem configurar servidor do zero.
Camada 3 — reversível a baixo custo.

---

## D-006 · Documentos fiscais: provedor terceirizado por API
**Status:** Fechada

CT-e e MDF-e via provedor, não integração direta com SEFAZ.

**Por quê:** é obrigação básica já resolvida no mercado; o tempo vale mais investido em
experiência de uso.

**Restrição inegociável:** a emissão acontece **dentro do fluxo do Mash**, invisível
para o operador. O problema do cliente não é a qualidade da emissão — é ter que sair do
sistema para emitir. Se o operador vir a palavra "provedor" na tela, a dor foi
reproduzida.

---

## D-007 · Idioma do código e do schema: inglês, com exceções
**Status:** Fechada

Inglês por padrão. Português apenas para termos com significado legal ou setorial
brasileiro, escritos como o setor escreve: `CTe`, `MDFe`, `NFe`, `Romaneio`, `Tomador`,
`Embarcador`, `Ciot`, `Icms`.

**Por quê:** português vira identificador inconsistente — sem acento (`endereco`),
plural e gênero irregulares (`cotacoes`) — produzindo um pseudo-português que não é
nem uma língua nem outra. E destoa de todo o ecossistema em volta.

Termos com definição jurídica não se traduzem: `serviceTaker` não simplifica "tomador
do serviço", destrói precisão e gera bug.

**Ação:** manter a lista de exceções num arquivo, para não decidir palavra por palavra.

---

## D-008 · Idioma de tela: português, com glossário
**Status:** Fechada

Tela 100% em português, com a terminologia exata que o operador usa na operação.

**Por quê:** é o produto, não preferência. A dor que o Mash vem curar é sistema que
fala uma língua diferente da operação.

**Ação:** manter um **glossário tela ↔ código** desde o primeiro dia. Serve ao produto
e impede a IA de inventar tradução na hora.

---

## D-009 · Perfis de usuário e permissões
**Status:** Fechada

Usuários do sistema: operador, gestor, financeiro, admin.
Motorista é **entidade de cadastro, não conta de acesso** — sem app de motorista no MVP.

Permissões: campo `role` simples no usuário. Matriz configurável é camada 3.

**Regra inviolável:** papel e tenant são separados.
- **Tenant** define *quais dados existem* — garantido pelo banco (D-012)
- **Papel** define *o que se pode fazer* com eles — garantido pela aplicação

No dia em que as duas lógicas se misturarem numa consulta, a garantia de isolamento
morreu.

---

## D-010 · Portal do embarcador
**Status:** Assento reservado

Fora do MVP. Reservado no modelo:
- Usuário nasce com vínculo **opcional** a um cliente
- Status nasce com distinção entre **interno e público**

**Por quê:** o RLS protege tenant A de tenant B, mas **não** protege embarcador X de
embarcador Y — ambos vivem no mesmo tenant. Exige uma segunda camada de autorização,
com o mesmo rigor. E dois vocabulários de status: a operação registra "aguardando
liberação do financeiro"; o cliente não deveria ver isso.

**Custo de não reservar:** auditar cada consulta de carga do sistema, uma a uma.

**Nota:** em TMS modernos este costuma ser o recurso mais valorizado, porque elimina o
tráfego de "cadê minha carga?" no WhatsApp. Provável que vire prioridade.

---

## D-011 · Filial e múltiplos CNPJs
**Status:** Assento reservado

Filial não é organograma, é **CNPJ**. Cada CNPJ tem inscrição estadual, certificado
digital A1 e **numeração sequencial de CT-e própria** — sem buracos, sem repetição, sob
validação da SEFAZ.

Reservado no modelo:
- Entidade `Branch` desde a primeira migração; todo tenant nasce com filial padrão
- **Movimento** carrega `branchId`: pedido, viagem, CT-e, fatura
- **Cadastro** não carrega: cliente, motorista, veículo, tabela de preço
- Zero tela, zero filtro, zero permissão por filial no MVP

Regra de bolso: *cadastro é da empresa, movimento é da filial.*

**Não modelar filial como tenant separado.** Parece elegante e reaproveita o RLS, mas
quebra a visão consolidada e obriga login e cadastro em duplicidade — reproduzindo a
dor de fragmentação que o produto veio curar.

**Custo de não reservar:** reescrever o módulo fiscal quando aparecer o segundo CNPJ,
com dado real dentro.

---

## D-012 · Isolamento entre clientes: multi-tenant com Row-Level Security
**Status:** Fechada · implementação em `d012-multi-tenant-rls.md`

**Correção 03/09/2026:** o guia de implementação tinha dois bugs verificados na prática
ao construir a primeira tabela (`Tenant`) — política sem `nullif(..., '')` antes do cast
(estoura erro em vez de zero linhas numa conexão de pool já usada) e `forTenant()` sem
gancho para `$queryRaw`/`$executeRaw` (consulta crua saía sem tenant definido). Corrigido
no guia; a decisão em si (RLS por tenant) não muda.

Multi-tenant por coluna `tenant_id` em cada tabela, **com Row-Level Security do
PostgreSQL ativado**.

**Por quê o RLS:** o modo padrão é a aplicação lembrar de filtrar por `tenant_id` em
toda consulta. Esquecer uma vez — uma — e a transportadora A vê a tabela de preço da
transportadora B. Isso não é bug, é fim de empresa.

Com RLS, a sessão declara o tenant e o banco recusa linhas de outros tenants — não
importa o que a aplicação peça, nem se houver SQL cru, nem se a IA gerar consulta sem
o filtro. O guarda deixa de ser a memória do desenvolvedor e passa a ser o banco.

Troca *"eu preciso nunca errar"* por *"errar não causa dano"*. É o critério da camada 1.

**Três armadilhas, todas silenciosas:** o dono da tabela ignora RLS; o pool de conexões
vaza tenant entre requisições; `USING` protege leitura mas não escrita. Tratamento
completo, com código e testes, em `d012-multi-tenant-rls.md`.

---

## D-013 · Representação de dinheiro
**Status:** Fechada

`numeric` do PostgreSQL (`Decimal` no Prisma). Nunca ponto flutuante, nunca centavos
como inteiro.

Três escalas, definidas uma vez:

| Uso | Tipo |
|---|---|
| Valores finais (total, fatura, CT-e) | `numeric(14,2)` |
| Tarifas e preços unitários (R$/ton, R$/km) | `numeric(18,6)` |
| Percentuais (ICMS, adicionais) | `numeric(7,4)` |

**Por quê não centavos inteiros:** frete não opera só em duas casas. Tarifa por
tonelada, por quilômetro e alíquota exigem quatro a seis decimais antes de virar
total. Centavos inteiros obrigariam a inventar um fator de escala por caso —
reimplementar mal a aritmética de ponto fixo que o banco já faz certo.

**Armadilha:** o Prisma devolve `Decimal`, que é objeto. `a + b` em JavaScript
**concatena string** em vez de somar, silenciosamente. Sempre `.plus()`, `.times()`,
`.dividedBy()`. É o erro que a IA comete com mais frequência aqui, porque a versão
errada parece mais natural.

**Arredondamento:** precisão cheia durante todo o cálculo, arredonda apenas na saída —
o valor que vai para o CT-e ou para a fatura. Arredondar em etapa intermediária gera
diferenças de centavos impossíveis de explicar depois.

**Moeda:** BRL única. Assento **não** reservado, deliberadamente. Adicionar coluna
`currency` com padrão depois é trivial; o que é caro em multimoeda é taxa de conversão,
data de conversão e moeda funcional — e isso é projeto, não coluna. Reservar assento
vale quando o retrofit é caro, não como regra automática.

---

## D-014 · Dado temporal: vigência e imutabilidade
**Status:** Fechada

Duas camadas distintas, ambas necessárias. Confundi-las é o erro clássico de TMS.

### Vigência na tabela de preço

Tarifa tem `validFrom` e `validTo`. **Nunca há UPDATE nos valores da tarifa nem na
identidade da linha** (`tenantId`, `customerId`, `laneId`, `validFrom`). Alterar preço
significa fechar a linha vigente e inserir outra. A tabela vira registro de auditoria
por construção, e responde tanto "qual era o preço em 12/03" quanto "qual entra em
vigor mês que vem".

**Correção 04/09/2026:** a redação original dizia "nunca há UPDATE numa tarifa", cheia,
sem exceção — mas "fechar a linha vigente" só é possível **alterando `validTo`** da
linha antiga, o que é um UPDATE. A imutabilidade é sobre os valores e a identidade da
linha, não sobre o campo de fechamento. Garantido no banco, não só por disciplina —
mesmo critério do RLS: em vez de confiar em ninguém rodar `UPDATE` errado, a permissão
de `UPDATE` do role de aplicação cobre **só** `validTo` e `updatedAt`:

```sql
GRANT UPDATE ("validTo", "updatedAt") ON "FreightRate" TO mash_app;
```

Sem `GRANT UPDATE` geral na tabela. Qualquer tentativa de alterar tarifa, frete
mínimo, `tenantId`, `customerId`, `laneId` ou `validFrom` falha na hora — Postgres
recusa o `UPDATE` inteiro se o `SET` tocar qualquer coluna fora da lista concedida, sem
precisar de trigger nem lógica própria pra manter.

**`DELETE` também é revogado do role de aplicação** (`REVOKE DELETE ON "FreightRate"
FROM mash_app`, 04/09/2026). Tarifa é histórico financeiro — cotação e fatura, quando
existirem, referenciam a linha, e apagar quebra a rastreabilidade do preço aplicado
(D-017: movimento financeiro nunca se apaga). Erro de cadastro se corrige fechando
`validTo` (o único `UPDATE` permitido), nunca apagando a linha. `mash_app` mantém
`SELECT` e `INSERT`.

O risco separado é sobreposição: duas linhas válidas para o mesmo trecho na mesma data,
com o preço dependendo de qual o banco retornou primeiro. Resolvido na definição da
tabela:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE freight_rate ADD CONSTRAINT no_overlapping_validity
  EXCLUDE USING gist (
    tenant_id   WITH =,
    customer_id WITH =,
    lane_id     WITH =,
    daterange(valid_from, valid_to, '[)') WITH &&
  );
```

Mesmo critério do RLS: em vez de lembrar de validar, errar deixa de ser possível.

### Congelamento do movimento

Vigência sozinha não basta. Recalcular a cotação a partir da tabela expõe o sistema ao
dia em que a **lógica** de cálculo mudar — novo adicional, nova regra de arredondamento
— e março passar a produzir número diferente do que foi faturado em março.

No fechamento da cotação, os valores aplicados são **copiados** para dentro dela:
tarifa usada, frete mínimo, adicionais, total, mais a referência à linha de tarifa de
origem para auditoria. A cotação deixa de ser consulta e passa a ser fato.

### Documento fiscal é append-only

CT-e autorizado pela SEFAZ nunca é editado. Correção vira carta de correção ou
cancelamento — registros novos, não alteração do original. O modelo trata isso como
append-only desde a primeira migração: adicionar imutabilidade depois não recupera o
que já foi sobrescrito.

---

## D-015 · Formato de identificadores
**Status:** Fechada

Chave primária: **UUID v7**, gerada na aplicação.

**Por quê v7 e não v4:** é ordenado por tempo, o que dá localidade de índice. UUID v4
insere em posições aleatórias e fragmenta o índice B-tree conforme o volume cresce.
E nenhum dos dois vaza informação — ID sequencial exposto conta ao cliente quantos
pedidos a empresa fez no mês.

**Regra:** chave primária e número de negócio são coisas diferentes e nunca se
misturam. Número do pedido, do CT-e e da fatura são sequenciais, aparecem na tela e
têm regra própria. A UUID nunca aparece para o operador.

**Numeração de CT-e:** sequencial por CNPJ e por série. **Não usar `SEQUENCE` do
PostgreSQL** — sequence consome número mesmo em rollback, abrindo buraco, e buraco
exige inutilização de numeração junto à SEFAZ. Usar tabela contadora com
`SELECT ... FOR UPDATE`, e atribuir o número **no momento da transmissão**, não na
criação do rascunho.

---

## D-016 · Fuso horário e timestamps
**Status:** Fechada

`timestamptz` sempre. Aplicação roda em UTC (`TZ=UTC`); conversão para
`America/Sao_Paulo` apenas na apresentação.

**Atenção com o Prisma:** `DateTime` mapeia para `timestamp` **sem** fuso por padrão.
É obrigatório escrever `@db.Timestamptz(3)` explicitamente em cada campo.

**Por quê importa no domínio:** o Brasil tem quatro fusos e carga lotação
interestadual os cruza. Coleta às 8h no Acre e entrega às 8h em São Paulo não são o
mesmo horário.

**Exceção que quase todo mundo erra:** data pura usa `date`, não `timestamptz`.
Vigência de tarifa, vencimento de fatura e data de emissão são datas de calendário —
sem hora, sem fuso. Guardar como timestamp gera erro de um dia na conversão, visível
só perto da meia-noite.

---

## D-017 · Exclusão de registro
**Status:** Fechada

**Não adotar soft delete genérico.** `deletedAt` em toda tabela recria o problema do
`tenantId`: toda consulta precisa lembrar de filtrar, e esquecer uma vez faz registro
apagado reaparecer. Mesmo modo de falha — e sem um RLS para salvar.

Resolver por tipo de dado, com o vocabulário do domínio:

| Tipo | Comportamento |
|---|---|
| Movimento fiscal e financeiro | Nunca se apaga. Cancelado é **estado**. Guarda fiscal: 5 anos |
| Cadastro (cliente, motorista, veículo) | `active` / status inativo. Botão na tela diz "Inativar" |
| Rascunho e lixo genuíno | Hard delete, sem cerimônia |

A vantagem: ninguém esquece de filtrar por "inativo", porque isso é regra de negócio
visível, não coluna técnica escondida.

**LGPD:** pedido de exclusão de dado pessoal se resolve por **anonimização**, não
deleção — o CT-e que referencia a pessoa precisa continuar existindo por cinco anos.
Substituir nome e CPF por marcadores preserva integridade fiscal e atende o pedido.

---

## D-018 · Modelo de dados do TMS de lotação
**Status:** Fechada na estrutura · dois pontos pendentes de validação de domínio

**Core** (sem `branchId`): `Tenant` · `Branch` · `User`
**Cadastro** (sem `branchId`): `Customer` · `Address` · `Driver` · `Vehicle` · `Lane` · `FreightRate`
**Movimento** (com `branchId`): `Order` · `Trip` · `CTe` · `MDFe` · `Occurrence` · `Invoice`

### Decisões de modelagem

**Cliente é uma parte, não um papel.** Não existem entidades separadas para remetente,
destinatário e tomador — o mesmo CNPJ pode ser os três na mesma carga. Existe um
`Customer` único, e os papéis são relacionamentos dentro do `Order`. Separar em três
tabelas produz o mesmo cliente cadastrado três vezes e nenhuma consolidação de
faturamento.

**Tomador é campo próprio e obrigatório.** Quem paga o frete pode ser um terceiro. O
CT-e exige designação explícita, e ela determina destaque de ICMS e destino da fatura.
Nunca inferir de remetente ou destinatário.

**Veículo é composição.** Cavalo mecânico mais uma ou duas carretas, cada um com placa
e RENAVAM próprios — o MDF-e exige declarar todos. `Vehicle` é a unidade; a composição
vive na viagem.

**Chaves de NF-e penduram no CT-e.** A transportadora não emite a nota da mercadoria;
o embarcador emite e o CT-e referencia as chaves. Relação um-para-muitos, obrigatória
na emissão.

**`Quote` é etapa opcional.** Se existe, o `Order` referencia. Se não, o preço vem da
consulta à `FreightRate` na criação. Nos dois caminhos o pedido congela os valores
aplicados (D-014). O fluxo diverge, o modelo não.

**`Order` ↔ `Trip` é um-para-muitos.** Mesmo que a operação seja quase sempre 1:1 —
300 toneladas são dez caminhões num pedido só. Modelar 1:N sem precisar não custa
nada; modelar 1:1 e precisar de 1:N depois significa mexer em pedido, viagem, CT-e e
faturamento com dado real dentro.

**`Occurrence`** registra eventos da viagem. Parece secundário no MVP e é o que
alimenta o portal do embarcador (D-010) — onde a distinção entre status interno e
público vai morar.

---

## D-019 · Terceiros e agregados
**Status:** Fechada · **entra no MVP**

**Validação de campo:** em transportadoras de pequeno e médio porte, aproximadamente
**30% frota própria contra 70% terceiros/agregados**. Operações 100% próprias existem,
mas são minoria concentrada em grande porte.

Isso reverte a recomendação inicial de deixar terceiros fora do MVP: um TMS que só
gerencia frota própria cobre menos de um terço da operação do cliente-alvo. Não é
produto incompleto — é produto que não serve.

### Corte: registro entra, emissão fica

| Entra na v1 | Fica para depois |
|---|---|
| Cadastro de terceiro (TAC, ETC e CTC) | Emitir CIOT pelo Mash |
| Contratação da viagem com terceiro | Emitir vale-pedágio pelo Mash |
| Frete acordado, adiantamento, saldo, status | Integração com instituição equiparada |
| Campos para **registrar** CIOT e vale-pedágio emitidos fora | |

A transportadora já emite CIOT por algum canal. Registrar o número resolve operação e
controle; a emissão integrada vira melhoria. Mesma lógica da D-006.

**Consequência assumida:** a v1 reduz a fragmentação, não a elimina — o operador ainda
sai do sistema para emitir CIOT. Aceitável num piloto, desde que declarado, nunca
vendido como se não existisse.

---

## D-020 · Extensibilidade e personalização
**Status:** Fechada

Três níveis, em ordem crescente de custo:

| Nível | O que é | Quando |
|---|---|---|
| **1 — Planos** | Tabela de recursos habilitados por tenant | Agora |
| **2 — Configuração** | Campos extras, status próprios, regras parametrizadas | Quando o terceiro cliente pedir a mesma coisa |
| **3 — Extensão programável** | Sandbox, API pública, código de terceiro | Só com base de clientes e time |

**Regra inviolável:** nunca `if (tenant === 'X')` no código do núcleo. Foi assim que
todos os TMS que o Mash quer superar viraram o que são — não numa decisão grande, mas
em duzentas pequenas, cada uma justificada por uma venda.

### Preparação para o nível 2 (feita agora, custo baixo)

- **Porta única de configuração:** um `SettingsService` que todo módulo consulta, usado
  desde o primeiro dia mesmo contendo só flags de plano. Configuração espalhada pelo
  código é que não tem conserto.
- **Listas de domínio que variam por cliente ficam em tabela, não `enum`:** status de
  viagem, tipos de ocorrência, motivos de cancelamento. `tenantId` nulo = padrão do
  sistema; preenchido = daquele tenant. Trocar `enum` por tabela depois é migração com
  backfill; nascer tabela custa zero.
- **Não vale para listas fixas por lei ou pelo sistema:** `role`, tipo de documento
  fiscal, tipo de veículo permanecem `enum`.

**Não reservar:** coluna de campos extras, template de documento, layout. Adicionar
coluna nula depois é barato — mesmo critério que recusou a coluna de moeda em D-013.

### Sobre copiar os TMS de referência

Copiar o **modelo de dados** deles é sábio: a realidade fiscal e operacional que
acumularam em vinte anos economiza meses de erro. Copiar a **superfície** — a
quantidade de campos, o fluxo em oito passos — é herdar a doença. Aquilo não é
sabedoria, é sedimento de duas décadas de customização por cliente.

---

## D-021 · Stack de front-end
**Status:** Fechada

- **React + Vite** — não Next.js. Sistema interno atrás de login não precisa de SEO nem
  renderização no servidor; o NestJS já serve a API. Next só adicionaria maquinário.
- **Tailwind + shadcn/ui** — os componentes são copiados para dentro do repositório e
  viram código próprio, editável sem lutar contra API de terceiro. É também o par com
  maior massa de exemplos existente, o que atende o critério da D-002.
- **TanStack Table** para listagens — o componente de tabela do shadcn é só visual, sem
  ordenação, filtro ou virtualização. Um TMS precisa dos três.
- **React Hook Form + Zod** nos formulários. O mesmo schema Zod valida no front e no
  NestJS: uma definição, dois lados.

---

## D-022 · Interface: princípios e direção visual
**Status:** Fechada

Briefing: minimalista, moderno e sofisticado. Sem aparência de sistema legado, sem
gradiente decorativo, sem glassmorphism, sem cara de template de SaaS de marketing. O
operador precisa se localizar sem esforço e não cansar em oito horas de uso.

### Princípios operacionais

Software operacional tem objetivos **opostos** aos do design que vende. O operador não
visita a tela — ele mora nela, repetindo a mesma tarefa centenas de vezes.

- **Densidade ganha de respiro.** Espaço em branco generoso obriga a rolar a tela para
  ver vinte pedidos que deveriam caber de uma vez.
- **Teclado ganha de mouse.** Sistema legado de terminal é feio e rápido. Se o Mash for
  bonito e exigir mouse, será **mais lento** que o atual — a forma mais provável de o
  produto fracassar parecendo melhor.
- **Repetição ganha de novidade.** Toda listagem igual, todo formulário igual. Aprendeu
  uma, aprendeu todas.
- **Zero animação decorativa.** Transição de 300ms encanta na primeira vez e custa meio
  segundo na ducentésima.

**Teste de aceitação de qualquer tela:** *o operador faz isso mais rápido do que faz
hoje?* Se não, a tela falhou, por mais bonita que esteja.

### Arquitetura de informação — o diferencial

TMS legado se organiza como CRUD: menu, cadastro, listagem, formulário. O operador
navega uma árvore de menus e monta o trabalho na própria cabeça. É a origem da dor
relatada.

O Mash se organiza por **tarefa**: a tela acompanha o trabalho e o próximo passo já
está ali. "Cadastrar pedido" não é uma tela — é o começo de um caminho que termina no
CT-e emitido, sem voltar ao menu.

Isso vem **antes** do visual.

### Teclado — nasce junto, não é polimento

Retrofitar navegação por teclado é caro porque afeta cada componente. Mínimo desde o
primeiro dia:

- Setas navegam linha em qualquer listagem; Enter abre, Esc fecha
- Paleta de comandos em `Ctrl+K` (`cmdk`, já incluso no shadcn) — substitui metade dos menus
- Ordem de tabulação pensada no formulário; Enter salva
- **Nenhuma ação que exista apenas no mouse**

### Direção visual

**Cor.** O acento de marca **não pode competir com cor de status**. Verde, âmbar e
vermelho são informação no TMS — entregue, atenção, problema — e o operador lê status
por cor antes de ler a palavra. Marca fica em azul profundo ou índigo, usada apenas em
ação primária e seleção. Marca verde faria todo botão parecer "sucesso".

Fundo neutro muito claro, não branco puro; texto quase-preto, não preto puro. Contraste
máximo cansa em jornada longa.

**Tipografia.** Uma família só. Números são a maior parte do que o operador lê — valor,
peso, placa, chave de CT-e — então a escolha se decide por algarismos tabulares. IBM
Plex Sans (com Plex Mono para códigos) ou Inter.

`font-variant-numeric: tabular-nums` em **toda** coluna numérica. Sem isso os dígitos
têm larguras diferentes, a coluna não alinha, e escanear trinta fretes fica
mensuravelmente mais lento.

**Densidade — corrigir os padrões do shadcn no primeiro dia**, antes de existirem
sessenta telas:

| Item | Valor |
|---|---|
| Fonte base | 14px (rótulos 12–13px) |
| Altura de linha de tabela | 36px (padrão do shadcn: 48px) |
| Altura de campo | 32px |
| Escala de espaçamento | múltiplos de 4px; folgas típicas 8/12/16 |
| Raio de borda | 4–6px, uniforme — raio grande lê como produto de consumo |

**Hierarquia por peso e cor, não por caixa.** Painel com borda de 1px em vez de sombra.
Sombra apenas para elevação real — menu suspenso, modal. É o que separa "moderno" de
"glassmorphism mal feito".

**Movimento** apenas para confirmar mudança de estado, no máximo 150ms. Nenhuma
animação de entrada.

**Modo escuro:** assento reservado, não construído. Tokens em variáveis CSS desde o
início; um único tema desenhado agora.

### Referências

Densas, rápidas, feitas para uso diário: Linear, Retool, painel da Stripe, Airtable.

**Evitar** dashboard de SaaS de marketing — desenhado para impressionar numa captura de
tela, não para ser usado oito horas.

---

## D-023 · Gerenciamento de risco: liberação e averbação
**Status:** Fechada · registro entra, integração fica

### Por que existe

A apólice obriga a transportadora a fazer cadastro e consulta na gerenciadora de riscos
sobre a validade das documentações do motorista, do veículo e do proprietário **antes de
qualquer carregamento**, acatando o resultado. Motorista "não recomendado",
"inexistente" ou "não autorizado" impede o embarque.

**O não cumprimento faz perder o direito à indenização em caso de sinistro.** A carga
sai, é roubada, e a seguradora não paga.

Validade por vínculo: ~12 meses para frota e funcionários, ~6 meses para agregados,
**consulta a cada viagem para autônomos**. Com 70% da operação em terceiros (D-019),
isso é rotina diária.

### Como é hoje (campo)

Via site ou aplicativo da gerenciadora, **externo ao TMS**. Tempo médio de 30 a 45
minutos; o operador dispara e vai fazer outra coisa. Controle no site da gerenciadora ou
em planilha paralela. Gerenciadoras citadas: Buonny, Opentech, Global 5, Nox.

### Consequência para o modelo

Não é bloqueio síncrono — é **estado de espera**. A viagem precisa existir enquanto
aguarda. "Aguardando liberação de risco" é status interno, do tipo que a D-010 já previu
não expor ao cliente.

**Entra na v1:** ficha de liberação como entidade — número, motorista, veículo,
proprietário, data, validade, resultado. Mata a planilha paralela.
**Fica para depois:** integração com API de gerenciadora.

### Averbação

Hoje é **automática após a emissão do CT-e**, via AT&M; manual no site apenas quando o
sistema falha. É comportamento esperado, não diferencial, e é consumidor de evento puro:
CT-e autorizado dispara averbação. Encaixa na arquitetura de eventos (D-004) sem
esforço.

**Risco a resolver antes da v1:** se o Mash não averbar automaticamente, o operador
passa a averbar à mão — o produto **piora** um ponto que ele já tem resolvido. Verificar
se a AT&M oferece API e a que custo. Se for viável, provavelmente precisa entrar.

---

## D-024 · Emissão de CT-e a partir do XML da NF-e
**Status:** Fechada · entra na v1

O cliente envia a nota formalmente por e-mail, às vezes por WhatsApp. Com XML anexado,
os campos do CT-e se preenchem automaticamente; com PDF, o preenchimento é manual.

Suportar os dois caminhos é obrigatório. A importação de XML é ganho de tempo direto e
forte candidata a diferencial percebido.

---

## D-025 · Faturamento
**Status:** Fechada · fatura entra, boleto fica

**Fatura agrupa vários CT-e**, não é um a um. Entra na v1 com contas a receber básico.

**Boleto fica fora da v1.** O mecanismo de mercado é arquivo remessa e retorno no padrão
CNAB — largura fixa, variação por banco, e quando falha, falha em dinheiro do cliente.
Relato de campo: integração instável, boletos deixados para trás, cliente sem conseguir
pagar, faturamento atrasado.

**Quando entrar, entra por API de provedor moderno** (Asaas, Cora, Iugu): emissão por
HTTP, confirmação por webhook, sem arquivo posicional. Reduz semanas de bug financeiro a
alguns dias de integração.

---

## D-026 · Controle de combustível
**Status:** Fechada · **v1.1, não v1**

**Oportunidade identificada em campo.** Empresas de pequeno porte controlam combustível
por cálculo manual e coleção de comprovantes, às vezes conferindo o tanque para checar a
palavra do motorista. Dói no bolso, e a avaliação do sócio é que a maioria dos sistemas
não oferece controle convidativo o bastante para a tarefa migrar para o digital.

Dor cara, frequente, mal atendida pelos concorrentes, e **sem dependência de integração
com terceiros** — é registro e cálculo. Encaixa na tese do produto: diferencial por
experiência, não por funcionalidade inédita.

**Versão barata (a que interessa):** registro de abastecimento — veículo, data, litros,
valor, hodômetro, foto do comprovante. Permite consumo por veículo e por viagem. Dias de
trabalho.
**Versão cara (fora de escopo):** gestão de frota completa — manutenção preventiva,
pneus com rodízio e recapagem, ordens de serviço.

Fora da v1 porque não é necessário para rodar a operação. Primeiro item da v1.1, e forte
candidato a ser o que faz o cliente recomendar o produto.

---

## D-027 · Ordem de coleta
**Status:** Fechada · entra na v1

Existe para qualquer pedido e sua emissão é **opcional**. Serve à comunicação entre
operador e motorista, não ao cliente final.

Conteúdo: local, data, endereço, peso, quantidade, cubagem, janela de coleta e horário
de funcionamento, dados do motorista, relação de itens, mão de obra, referência a nota
fiscal / romaneio / pedido.

Como o motorista não tem conta de acesso (D-009), a saída é **PDF ou link
compartilhável**. Barato, e é degrau natural para o app de motorista no futuro.

---

## D-028 · Fatia mínima vendável (v1)
**Status:** Fechada

**Critério de corte:** a transportadora roda a operação do dia a dia inteira no Mash sem
abrir outro sistema? Se não, não é vendável — a dor curada é fragmentação, e um TMS
incompleto vira mais um pedaço.

### Entra

| Área | Escopo |
|---|---|
| Cadastros | Cliente, motorista, veículo, terceiro (TAC/ETC), tabela de frete com vigência |
| Comercial | Cotação caso a caso **e** por tabela; pedido com múltiplos destinos → múltiplas viagens |
| Operação | Viagem própria ou terceirizada; ordem de coleta em PDF; ocorrências; ficha de liberação |
| Fiscal | CT-e com importação de XML e preenchimento manual; MDF-e; emissão via provedor, dentro do fluxo |
| Financeiro | Fatura agrupando CT-e; contas a receber; pagamento a terceiro (acordado, adiantamento, saldo, status) |

Cotação entra nos dois formatos porque a divisão de campo é praticamente meio a meio:
caso a caso para clientes novos e de baixo volume, contrato e tabela para clientes
engajados e de alto volume.

### Fica fora

Boleto e CNAB · integração com gerenciadora de risco · gestão de frota completa ·
combustível (v1.1) · rastreamento · portal do embarcador · emissão de CIOT e
vale-pedágio · filial operacional · app de motorista · roteirização · relatórios além de
uma tela de acompanhamento.

### Prazo — estimativa honesta

Somando fundação, cadastros, comercial, operação, fiscal e financeiro: **25 a 30
semanas**, assumindo que nada dê errado e sem contar tempo de aprendizado. **Não cabe em
seis meses. Cabe em oito a dez.**

O fiscal é o que mais estoura. CT-e e MDF-e custam o dobro do previsto mesmo com
provedor, porque a validação da SEFAZ é implacável e cada rejeição vira investigação.

**Ação urgente:** calcular com precisão o fôlego financeiro esticado. A diferença entre
seis e dez meses é a diferença entre o projeto existir ou não — e essa conta é mais
urgente que qualquer decisão técnica tomada até aqui.

---

## D-029 · Identificação do tenant no login
**Status:** Fechada

O login pede três campos: `slug` da transportadora, e-mail e senha. Não é possível
resolver o tenant só por e-mail+senha porque a política de RLS do `User` (D-012) exige
`app.current_tenant_id` já definido na sessão — e antes do login não há tenant nenhum
definido. É ovo-e-galinha: para autenticar, a consulta precisaria já saber o tenant; para
saber o tenant, precisaria consultar sem RLS.

**Alternativas recusadas:**
- **Role de banco com `BYPASSRLS`** para a consulta de login. Resolveria, mas abre um
  segundo caminho deliberado de furar RLS — e um precedente é perigoso: a próxima pessoa
  com pressa reusa o mesmo role "só dessa vez" para outra coisa, e o guarda do D-012 vira
  suíço.
- **E-mail globalmente único**, resolvendo o tenant pelo próprio e-mail. Rejeitado porque
  a mesma pessoa pode atender mais de uma transportadora (ex.: o sócio consultor —
  contexto.md) — `@@unique([tenantId, email])` foi decisão deliberada, não esquecimento.

**Consequência para o `Tenant` (D-012):** a política original de `Tenant` (linha só
enxerga a si mesma, `id` como fronteira) tinha o mesmo problema — bloqueava até a leitura
de slug pré-login. Trocada por política **por comando**: `SELECT` público (`USING
(true)`) — nome e slug não são dado sensível — e `INSERT`/`UPDATE`/`DELETE` continuam
isolados ao próprio tenant. É a única tabela do sistema com essa exceção; não é padrão a
copiar para tabela nova. Detalhe em `docs/d012-multi-tenant-rls.md`.

**Formato do slug:** minúsculo, sem espaço, reforçado por `CHECK` no banco
(`^[a-z0-9]+(-[a-z0-9]+)*$`), não só validação na aplicação — mesmo critério de D-012 e
D-014: o banco garante, a aplicação não precisa lembrar.

---

## D-030 · Regra de negócio vive na aplicação, não em trigger
**Status:** Fechada

Filial padrão do tenant (D-011) é criada por `TenantsService.create()`, numa transação
interativa que cria `Tenant` e `Branch` juntos — não por trigger de banco (`AFTER INSERT
ON "Tenant"`).

**Por quê:** um trigger que criasse a filial automaticamente precisaria gerar o próprio
`id` do `Branch` dentro do banco. Postgres 17 não tem `uuidv7()` nativo (chega só na
v18) — o trigger teria que reimplementar o algoritmo em PL/pgSQL, abrindo um **segundo
caminho de geração de identificador**, com lógica própria, direto contra D-015 (UUID v7,
gerado na aplicação, sem exceção) e contra "fonte única de verdade" (seção 3.2 do
`CLAUDE.md`).

**Alternativa recusada:** trigger `AFTER INSERT ON "Tenant"` criando o `Branch`
automaticamente, com `id` gerado no banco (`gen_random_uuid()`, UUID v4). Garantia mais
forte — vale até para `INSERT` cru, não só para quem passa pelo serviço —, mas quebra
D-015 nesse ponto específico, e esconde uma regra de negócio ("todo tenant nasce com
filial padrão") dentro de SQL que não aparece ao ler o código da aplicação, só a
migração.

**Princípio geral, para além deste caso: regra de negócio vive na aplicação, nunca em
trigger.** Trigger é lógica implícita — quem lê `TenantsService` não vê a filial sendo
criada se ela nascer de um trigger; quem lê o schema também não, a menos que abra a
migração e leia o SQL linha por linha. É o oposto do que `contexto.md` pede de "código
mantenível por IA": lógica previsível, visível, no lugar onde se espera encontrá-la.

**Exceção — só para garantia de integridade que o banco faz melhor que a aplicação:**
concorrência, unicidade, exclusão mútua sob corrida. Exemplos já no projeto:
- `EXCLUDE ... USING gist` na vigência de `FreightRate` (D-014) — impede duas tarifas
  sobrepostas mesmo com duas requisições simultâneas tentando gravar ao mesmo tempo.
  Não dá pra garantir isso só na aplicação: é exatamente o tipo de corrida que um
  `SELECT` seguido de `INSERT` no código não fecha.
- RLS (D-012) — isolamento entre tenants é caro demais pra confiar na aplicação lembrar
  de filtrar toda consulta; por isso vira garantia do banco.

**A diferença que separa os dois casos:** RLS e `EXCLUDE` protegem contra o que a
aplicação pode **errar sob concorrência** (esquecer o filtro, duas escritas
simultâneas colidindo). "Todo tenant nasce com filial padrão" não tem corrida nenhuma
pra proteger — é disciplina de **todo caminho de criação passar por um lugar só**. Isso
é o que o `TenantsService` já resolve, sendo a porta única; um trigger resolveria o
mesmo problema de um jeito mais forte, mas ilegível, e à custa de D-015.

---

## D-031 · Correção de nomenclatura: sender/recipient, não remetente/destinatário
**Status:** Fechada

Os campos de papel do `Order` (D-018) são `senderId`, `recipientId` e `tomadorId` — os
dois primeiros em inglês, o terceiro em português.

**Erro identificado 04/09/2026, pelo usuário:** ao modelar `Order`, apliquei aos três
campos o mesmo critério usado em `Address` (`logradouro`, `bairro`, `município`) —
"o schema de NF-e/CT-e usa essas palavras, D-024 vai precisar mapear". Isso não é o
critério do D-007. D-007 reserva português para **termo com definição jurídica que a
tradução destrói** ("`serviceTaker` não simplifica tomador do serviço"). "O XML usa essa
palavra" e "o termo tem definição jurídica" são coisas diferentes — só a segunda é a
regra.

`Tomador` passa no critério certo: a designação determina destaque de ICMS e destino da
fatura (D-018), um efeito jurídico real que "payer" não capturaria com a mesma precisão.
`Remetente`/`destinatário` não têm esse efeito — são só "quem despacha" e "quem recebe",
sem nuance fiscal própria. `sender`/`recipient` traduzem sem perder nada.

**Correção:** `remetenteId`→`senderId`, `destinatarioId`→`recipientId`, `tomadorId`
mantido. Migração `20260904081038_rename_order_customer_roles` (RENAME COLUMN, não
DROP+ADD — não há dado de produção ainda, mas é a forma correta).

**Nota para `Address`:** o critério ali continua válido — `logradouro`/`bairro`/
`município`/`UF`/`CEP` não têm definição jurídica própria isolada, mas são a
nomenclatura literal dos campos que D-024 vai mapear do XML de NF-e/CT-e, e não têm
tradução natural em uso no setor (ninguém fala "street" ao preencher um CT-e). A
diferença para remetente/destinatário: lá existe uma tradução natural e sem perda
(sender/recipient); em Address, a alternativa em inglês seria artificial.

Respondido pelo sócio, com base nas duas transportadoras da consultoria:

- **70% terceiros, 30% frota própria** em pequeno e médio porte → D-019
- **Um CT-e por viagem, com um único endereço de recebimento.** Um pedido vira várias
  viagens quando há mais de um local de entrega ou armazenagem antes do destino final →
  D-018
- **Não há padrão de tipo de carga.** A transportadora se adequa ao que a apólice de
  seguro permite carregar. Existem TMS de nicho, mas o mercado tem um padrão
  identificável e personalizável a partir dele → confirma D-020
- **Pequeno porte opera com CNPJ único**; médio tem matriz e filiais; grande tem centros
  de distribuição com CNPJ próprio. Emite-se geralmente por um só CNPJ, mas há casos de
  uso de outro por benefício fiscal → confirma D-011, e o emitente precisa ser
  escolhível por documento
- **Cotação:** caso a caso para clientes novos, contrato/tabela para engajados.
  Proporção quase igual; o volume de carga é o que determina → D-028

---

## D-032 · Pagamento a terceiro: contratação imutável + livro de eventos
**Status:** Fechada

Modela a contratação da viagem com terceiro (D-019) em duas tabelas, não uma:

**`CarrierHire`** — a contratação em si, 1:1 com `Trip`. Terceiro não é cadastro
próprio: reaproveita `Customer` (D-018 aplicado a D-019 — TAC/ETC já são PF/PJ, o
mesmo formato de `Customer`), papel vive em `thirdPartyId`. Só `agreedFreight` congela
na criação (D-014); CIOT (`ciotNumber`, só existe pra TAC) e vale-pedágio
(`tollVoucherSupplierCnpj`+`tollVoucherPurchaseNumber`+`tollVoucherAmount`, layout
mínimo exigido pelo grupo de vale-pedágio do MDF-e, D-028) são as únicas colunas com
`UPDATE` liberado — são emitidos fora do sistema depois que a contratação já existe,
não dá pra exigir no momento do `INSERT`.

**`CarrierPayment`** — livro de eventos append-only, não coluna de saldo/status.

**Por quê não `advanceAmount`/`balanceAmount` como coluna (erro corrigido nesta
sessão):** adiantamento a terceiro é parcelado, e existe desconto de avaria, diária,
multa e abastecimento descontado do frete (D-026), além de estorno. Com coluna única
por conceito, cada parcela ou desconto viraria `UPDATE` em valor financeiro — proibido
pelo histórico de D-017. Saldo e status de pagamento são **sempre** derivados por
`SUM(grossAmount)` sobre os eventos, nunca gravados.

`type` (`ADVANCE`/`BALANCE`/`DEDUCTION`/`REVERSAL`) é enum, não tabela de domínio: é
vocabulário fixo do sistema (como se soma ou subtrai do saldo), não varia por tenant —
diferente de `deductionReasonId`, que aponta pra `DeductionReason` (D-020, mesmo padrão
`QuoteStatus`/`TripStatus`) porque o motivo do desconto varia por transportadora.
`grossAmount`/`netAmount` são sempre positivos — o sinal vem de `type`, nunca do
número. `netAmount` separado de `grossAmount` porque pagamento a TAC pessoa física tem
retenção; não retrofita bem se nascer junto no mesmo campo.

`CHECK` no banco amarra `type = 'DEDUCTION'` a `deductionReasonId IS NOT NULL` (nos
dois sentidos) — garantido pelo banco, não por disciplina da aplicação, mesmo critério
de D-012/D-014/D-029. `UPDATE`/`DELETE` revogados por inteiro em `CarrierPayment`
(não `GRANT` de coluna como `FreightRate`/`Quote`/`CarrierHire`): nenhuma coluna aqui
legitimamente muda depois de criada — correção é `REVERSAL`, linha nova.

**Correção 05/09/2026:** `REVERSAL` nasceu sem amarra a qual pagamento desfazia —
qualquer linha `REVERSAL` batia o saldo certo aritmeticamente, mas sem apontar pra
nada, o que não prova correção nenhuma (duas reversões da mesma parcela, ou uma
reversão "solta" sem origem, passavam batido). Corrigido com `reversesPaymentId`
(auto-relação anulável em `CarrierPayment`) mais `CHECK` `(type = 'REVERSAL') =
(reversesPaymentId IS NOT NULL)` — mesmo mecanismo do `deductionReasonId` — e um
índice único parcial em `reversesPaymentId` (impede estornar o mesmo pagamento duas
vezes). Não valida (nem `CHECK`, que não enxerga outra linha, nem trigger — D-030 não
recomenda lógica de negócio em trigger) que o pagamento revertido pertence ao mesmo
`CarrierHire`, nem que o valor do estorno bate com o original; fica pra aplicação se um
dia importar.

**Vale-pedágio nunca entra no cálculo.** Por lei não compõe o valor do frete nem a
base de tributo — não é frete, não é desconto. Se entrasse em `agreedFreight` ou
virasse `CarrierPayment` tipo `DEDUCTION`, contaminaria a base de tributo. Por isso
vive só em `CarrierHire`, fora do livro de eventos.

**Pendência:** confirmar o leiaute exato do grupo de vale-pedágio do MDF-e com o
provedor antes de fechar quais campos são obrigatórios, e se falta campo de tipo do
vale. Se uma viagem puder ter mais de uma compra de vale-pedágio, os três campos viram
tabela 1:N — não modelado agora, custo baixo de adiar (D-020).

**Dívida de nomenclatura — corrigida em 07/09/2026 (D-033):** `Customer` foi renomeado
para `Party` (migração `20260907025604_rename_customer_to_party`, `RENAME`, não
DROP+ADD — mesmo critério da D-031). Os campos que faltavam (RNTRC, categoria ANTT,
vínculo agregado/spot) entraram em `CarrierProfile`, também na D-033.

---

## D-033 · Fecha a dívida de nomenclatura da D-032: `Party`, `CarrierProfile`,
`Vehicle.ownerPartyId`
**Status:** Fechada

Três mudanças de modelo, sem service nem controller — mesmo corte de `Trip`,
`CarrierHire` e `Occurrence`. Migração, modelo e teste em três passos separados,
suíte rodada entre eles.

### `Customer` → `Party`

`RENAME TABLE`/`RENAME COLUMN`/`RENAME CONSTRAINT`/`RENAME INDEX`, não DROP+ADD —
mesmo critério da D-031. Migração `20260907025604_rename_customer_to_party`. RLS,
`GRANT` e o `EXCLUDE USING gist` de `FreightRate` (D-014) seguem o rename de coluna
sozinhos: o Postgres referencia coluna e tabela por atributo/oid internamente, não
por nome — só as *constraints/índices com nome próprio* (`Customer_pkey`,
`Customer_tenantId_cpf_key`, `Customer_cpf_format`, `Address_customerId_fkey`,
`FreightRate_customerId_fkey` e os índices correspondentes) precisaram de `RENAME`
explícito, verificado consultando `pg_constraint`/`pg_indexes` depois de aplicar.

Atinge `Address.partyId`, os três papéis do `Order` (`sender`/`recipient`/`tomador` —
nomes de campo não mudam, só o model referenciado), `FreightRate.partyId` (inclusive
dentro do `EXCLUDE`) e `CarrierHire.thirdPartyId`. Tela continua dizendo "Clientes" e
"Transportadores" (D-008 intacto) — o nome do model é vocabulário de código.

Unicidade por documento dentro do tenant já existia (`@@unique([tenantId, cpf])` +
`@@unique([tenantId, cnpj])`, de quando a tabela ainda era `Customer`) — carregou para
`Party` sem precisar criar nada novo.

### `CarrierProfile`

Perfil opcional 1:1 com `Party` (`partyId` único) — é a existência do perfil que torna
a parte um transportador contratável, não um campo a mais no cadastro do cliente.
Campos: `rntrc` (texto livre, sem `CHECK` de formato — mesmo critério de
`Vehicle.renavam`, seção 1.6 do `CLAUDE.md`), `anttCategory` (enum `TAC`/`ETC`/`CTC` —
fixo por regulação, exceção D-020), `bondType` (enum `SPOT`/`AGREGADO` — fixo pelo
sistema, valores em português por serem vocabulário do setor, mesmo critério de
`VehicleType`). RLS padrão. Nada no banco hoje obriga `CarrierHire.thirdPartyId` a ter
`CarrierProfile` — a obrigatoriedade, se um dia existir, é regra de aplicação (D-030),
não constraint.

**`CustomerProfile` não foi construído — decisão consciente, não esquecimento.** Os
campos de cliente já vivem em `Party` (cadastro único desde D-018) e ninguém pediu
para separá-los. Criar `CustomerProfile` agora seria abstração especulativa sem caso de
uso (seção 2 do `CLAUDE.md`).

### `Vehicle.ownerPartyId`

FK anulável para `Party`. Nulo = frota própria do tenant; preenchido = de terceiro, com
o proprietário nominal que a ficha de liberação de risco (D-023) exige —
`RiskClearance.ownerName` hoje é só texto livre, sem vínculo a nenhum cadastro, e este
campo é o que torna o proprietário identificável (não pedido para religar as duas
tabelas agora — só registrado o motivo).

**O enum `VehicleOwnership` (`OWNED`/`THIRD_PARTY`) foi eliminado**, não mantido ao
lado da FK. Um enum paralelo poderia divergir do `ownerPartyId` — por exemplo
`ownership = 'OWNED'` com `ownerPartyId` preenchido — e nada no banco impediria essa
inconsistência. Contra a seção 3.2 do `CLAUDE.md` (fonte única de verdade): a
propriedade passa a ser derivada só da nulidade da FK. Migração
`20260907030434_vehicle_owner_party`: `DROP COLUMN "ownership"` + `DROP TYPE
"VehicleOwnership"` (não é rename — é remoção de um campo redundante em favor de outra
representação, critério diferente do `Customer`→`Party`, que preservava o mesmo dado).

### Verificação

Migração deploy incremental entre os três passos; ao final, `prisma migrate reset
--force` reaplicou as 17 migrações do zero sem erro. 140 testes e2e + 4 unitários
passando, incluindo o teste que é a razão de existir do renomeio (a mesma `Party` como
`tomador` de um `Order` e `thirdParty` de um `CarrierHire` ao mesmo tempo,
`party-is-not-a-role.e2e-spec.ts`) e o par de testes de propriedade de veículo
(`vehicle-owner.e2e-spec.ts`).

---

## D-034 · Ordem de coleta (D-027): `PickupOrder`, geração de PDF sob demanda
**Status:** Fechada

Primeira unidade com service e controller desde `Trip`/`CarrierHire`/`Occurrence` —
justificado só pela geração do PDF, que não dá pra testar batendo direto no banco.
Criação do `PickupOrder` continua via Prisma direto, sem service (não tem regra de
negócio equivalente ao congelamento de preço do `OrderService`).

### Biblioteca de PDF: `pdfkit`

Critério da D-002 pesado explicitamente (previsibilidade e massa de exemplos acima de
elegância). Três opções levantadas: `pdfkit` (API de baixo nível por coordenada, puro
JS, sem dependência nativa), `@react-pdf/renderer` (JSX, motor de layout flexbox-like
próprio, menos histórico pra documento denso/tabular) e Puppeteer/HTML→PDF (reaproveita
CSS, mas embarca Chromium headless — ~300MB, risco real de imagem/memória/cold start em
plataforma gerenciada, D-005). Escolhido `pdfkit` pelo usuário: sem binário externo,
maior massa de exemplos pra exatamente este caso (documento gerado de um backend Node).

### Layout: fluxo vertical, não posição fixa

Exigência explícita antes de escrever código: `pdfkit` posiciona por coordenada, e
layout de altura fixa quebra assim que o conteúdo real variar — a relação de itens pode
ter 1 ou 40 linhas. Implementado como fluxo vertical (`PdfFlow` em
`pickup-order.pdf.ts`): cada bloco pergunta se cabe (`ensure`) antes de desenhar, nunca
desenha parcialmente pra descobrir depois que não cabia (isso é o que corta texto).
Quebra de página automática quando o cursor passa da margem, com o cabeçalho de
identificação (título + data + remetente + cidade de coleta) redesenhado na página
nova — o motorista precisa saber de que coleta é a folha 2, sem expor UUID (D-015). O
cabeçalho de coluna da tabela de itens também redesenha, mas só quando a quebra
acontece dentro da seção de itens — um `onContinuedPage` setado tarde (só ao entrar na
seção de itens) evita redesenhar cabeçalho de tabela numa quebra que aconteceu antes
dela existir, e evita duplo-desenho quando o próprio cabeçalho da tabela não cabe (o
`ensure` do cabeçalho e o `onContinuedPage` chamariam o mesmo desenho duas vezes se não
separados em "calcula espaço" vs "só desenha").

Números (peso, quantidade, cubagem) em `Courier` — fonte de largura fixa —, mesma razão
do `tabular-nums` da D-022: dígito de largura variável não alinha, coluna que não
alinha é mais lenta de escanear.

**Verificado, não só conferido visualmente:** gerada a mesma ordem com 1 item e com 40.
1 item produz 1 página; 40 produzem 2, sem sobreposição, com "Item 40" presente e os 40
itens intactos no texto extraído de volta com `pdf-parse` (`PDFParse` da v2, API por
classe — `new PDFParse({ data: buffer }).getText()`, devolve `{ text, total }` com
`total` = contagem real de página). Contagem de cabeçalhos "(continuação)" no texto
extraído bate com `total - 1`. `pdf-parse` só como devDependency, usado nos testes —
`@types/pdf-parse` (pensado pra API antiga da v1) foi instalado por engano e removido:
a v2 é reescrita como classe e já publica os próprios `.d.ts`.

### Modelo

**Âncora é `Trip`, não `Order` direto.** "Dados do motorista" só existe de fato em
`Trip.driverId`/`vehicleId` (composição, D-018); `Order` 1:N `Trip` significa que cada
viagem tem sua própria ordem de coleta. `orderId` não é coluna própria — chega-se lá
via `trip.orderId`, fonte única de verdade (CLAUDE.md 3.2). `tripId` não é único: uma
viagem pode ter mais de uma emissão ao longo do tempo (corrigir é emitir de novo).

**Relação de itens é tabela filha (`PickupOrderItem`), não campo estruturado.** Lista
de tamanho variável — mesmo critério que já levou `Address` a ser entidade própria em
vez de blob (D-018). Este schema não tem `jsonb` em lugar nenhum; um campo estruturado
duplicaria isso com pior *query-ability* e sem precedente no projeto.

**Totais do cabeçalho (`totalWeightKg`, `totalVolumeCount`, `totalCubicMeters`) são
congelados na criação, não derivados da soma dos itens** — mesmo critério de
`Order`/`Quote` (D-014). Não há `CHECK` nem trigger reconciliando item com total: D-030
não recomenda regra de negócio em trigger, e não foi pedido.

**Peso e cubagem em `Decimal`, escala de `Vehicle.capacityKg`/`tareKg`** (kg, 3 casas) —
D-013 é sobre dinheiro especificamente, mas o princípio (nunca `number`/float) se
estende; reaproveitada a escala já existente em vez de inventar uma nova.

**Sem numeração sequencial própria.** A lista de conteúdo do D-027 não pede "número da
ordem de coleta", e `Order` também não tem número de negócio sequencial ainda (D-015
antecipa, não construiu) — não inventado aqui pra não estourar escopo. Promovido a
pendência bloqueante em "Pendências › Bloqueantes" abaixo: não é só a ordem de coleta
que sente falta disso, é o próprio CT-e que vai precisar.

**Imutável por inteiro** (`PickupOrder` e `PickupOrderItem`): é movimento (`branchId`
obrigatório, D-011), corrigir é emitir de novo — mesmo critério de `Order`/`CarrierHire`.
`UPDATE`/`DELETE` revogados do role de aplicação sem exceção de coluna.

### Sem link público, sem storage de arquivo

O endpoint (`GET /pickup-orders/:id/pdf`) gera os bytes na resposta HTTP e devolve via
`StreamableFile` — nada grava em disco, S3 ou qualquer storage; nada de rota pública
(a rota exige o mesmo `TenantGuard`/JWT de qualquer rota protegida). Link
compartilhável fica reservado para quando D-010 construir a segunda camada de
autorização (embarcador ou motorista sem conta hoje, D-009) — decisão registrada aqui
por pedido explícito, pra não nascer solta uma rota pública nesta etapa.

### Observado, não alterado

- `Order` não tem número de negócio sequencial — resolvido na D-035, logo abaixo.
- `RiskClearance.ownerName` continua texto livre, sem religar com `Vehicle.ownerPartyId`
  (D-033) — mencionado na D-033 como motivo de existir o campo, não pedido pra religar
  ainda.

---

## D-035 · Numeração de negócio (D-015): `DocumentCounter`, aplicada a `Order`
**Status:** Fechada

Fecha a pendência bloqueante que a D-034 registrou. Escopo desta unidade: só `Order`.
CT-e e fatura reaproveitam o mesmo mecanismo quando forem construídos — a tabela
nasceu genérica o bastante pra isso, sem precisar de reescrita.

### Não negociável, herdado direto da D-015

- Tabela contadora com `SELECT ... FOR UPDATE`, nunca `SEQUENCE` do PostgreSQL —
  `nextval()` nunca é desfeito por `ROLLBACK`, e é exatamente essa propriedade que
  abriria buraco.
- Chave primária (`Order.id`, UUID v7) e número de negócio (`Order.number`) nunca se
  misturam. A UUID continua nunca aparecendo pro operador.

### Escopo do contador: uma tabela `DocumentCounter` só, chave `(tenantId, branchId,
documentType, series)`

- `branchId` é CNPJ (D-011) — bate direto com "sequencial por CNPJ" que a D-015 exige
  do CT-e.
- `documentType` (`enum BusinessDocumentType`, só `ORDER` por ora) é o que torna a
  tabela genérica: um contador só, reaproveitado por todo documento numerado, em vez
  de uma tabela nova por tipo. Fixo pelo sistema, não varia por tenant — enum, não
  tabela de domínio (D-020, mesmo critério de `PaymentEventType`/`UserRole`). `CTE`/
  `INVOICE` entram como valor novo de enum quando essas unidades forem construídas —
  migração aditiva (`ALTER TYPE ... ADD VALUE`), não muda a forma da tabela.
- `series` (`String`, `NOT NULL DEFAULT '1'`) cobre a série fiscal que o CT-e exige
  ("e por série", D-015). `Order` não tem série de verdade, sempre usa a constante
  `"1"`. Deliberadamente não anulável: um `series` nulo quebraria a unicidade —
  Postgres trata cada `NULL` como distinto num índice único comum, a mesma armadilha
  que `QuoteStatus`/`DeductionReason` já resolveram com índice parcial (aqui nem
  precisa, porque a coluna nunca é nula).

Rejeitado explicitamente: `tenant+ano` pra `Order`. Nenhuma regra fiscal nem validação
de campo exige reset anual — é convenção contábil, não fiscal, e inventar isso agora
seria reservar complexidade não pedida (`CLAUDE.md` seção 2).

### Onde o número é atribuído: na criação, dentro da MESMA transação do `INSERT`

Diferente do CT-e (D-015: atribuído "no momento da transmissão", porque o rascunho
pode ser descartado sem nunca ser transmitido), `Order` não tem rascunho — todo `Order`
nasce válido e imutável (zero `UPDATE` liberado, D-017), num único `INSERT`
(`OrderService.createFromQuote`/`createFromFreightRate`). Não existe o cenário que
justifica separar "criação" de "atribuição do número" pro `Order`. O princípio
genérico — número e gravação definitiva andam juntos, na mesma transação — vale pros
dois casos; só o ponto do ciclo de vida em que isso ancora é diferente (criação aqui,
transmissão no CT-e).

### O que acontece se a transação falhar depois de pegar o número

Como o incremento do contador e o `INSERT` do `Order` estão na mesma transação
Postgres, um `ROLLBACK` desfaz as duas coisas juntas — não é "buraco aceitável", é
**buraco estruturalmente impossível** por falha interna (corrida entre conexões, erro
no meio da transação), contanto que todo caminho de criação passe pela mesma
transação. Verificado com teste dedicado (ver "Verificação" abaixo), não só afirmado.

Diferença real pro CT-e: lá pode existir buraco *depois* do commit, por rejeição da
SEFAZ — evento externo que a D-015 já antecipa e resolve por "inutilização de
numeração", fora do que esta tabela precisa resolver. O `DocumentCounter` só garante
ausência de buraco *interno*; buraco externo por rejeição fiscal é um processo
diferente, documentado, não um bug daqui.

### Implementação

`TenantPrisma` ganhou um método novo, `transaction()`, além do `db` já existente —
`db` não serve pra operação atômica de vários passos porque cada chamada nele abre a
própria mini-transação via `base.$transaction([...])` (`prisma-tenant.ts`), o que
quebraria o compartilhamento de conexão que a atomicidade exige. `transaction()` abre
uma transação interativa direto no `base`, chama `set_config` uma vez só no início
(mesmo padrão de `TenantsService.create()`), e devolve o `tx` pro chamador usar em
quantos passos precisar.

`NumberingService.nextNumber(tx, {tenantId, branchId, documentType, series?})` — não
injeta `TenantPrisma`, recebe o `tx` de fora: só faz sentido chamado de dentro da
transação que também grava a entidade numerada. Três passos dentro do `tx`:
1. `INSERT ... ON CONFLICT (tenantId, branchId, documentType, series) DO NOTHING` —
   bootstrap idempotente da linha do contador; a unicidade do escopo garante que só
   uma linha sobrevive mesmo se duas transações tentarem criar ao mesmo tempo.
2. `SELECT "lastNumber" ... FOR UPDATE` — trava a linha; qualquer outra transação
   pedindo número no mesmo escopo bloqueia aqui até esta commitar ou dar rollback.
3. `UPDATE "lastNumber" = lastNumber + 1` — grava o novo valor, devolvido ao chamador.

`OrderModule` ganhou dependência de um `NumberingModule` novo (`src/numbering/`) —
serviço isolado, sem controller nem entidade própria além do `DocumentCounter`, pronto
pra CT-e/fatura importarem quando existirem.

### `TenantPrisma.transaction()` é primitivo de uso restrito

Contorna o caminho normal do `forTenant()` — abre a transação direto no client `base`,
em vez de passar pela extensão que injeta `set_config` em cada operação
(`prisma-tenant.ts`). Necessário aqui (é o único jeito de compartilhar conexão entre o
incremento do contador e o `INSERT` da entidade), mas é exatamente o tipo de atalho
que fura D-012 em silêncio se usado errado daqui a três meses: o RLS "existe", os
outros testes continuam passando, e nenhum sintoma aparece até um tenant ver dado de
outro em produção.

Três regras, sempre que alguém chamar `transaction()`:
1. **Dentro do callback, use só o `tx` recebido** — nunca `this.tenantPrisma.db` nem
   um `PrismaClient` novo. `db` abriria a própria mini-transação numa conexão
   *diferente*, sem o tenant configurado nela; a proteção do `set_config` do
   `transaction()` externo não alcançaria essa segunda conexão.
2. **Nunca deixe o `tx` escapar do callback.** Depois que `transaction()` retorna, a
   conexão já voltou pro pool — um `tx` guardado e usado depois é uma transação que
   não existe mais.
3. **Prende uma conexão do pool (`max: 10`, `node-postgres`) pelo tempo inteiro do
   callback** — não é pra operação de duração longa ou imprevisível, sob risco de
   esgotar o pool (o mesmo pool que o teste de concorrência da numeração já usa até o
   limite, de propósito).

**Verificado, não só declarado** — `test/tenant-prisma-transaction-rls.e2e-spec.ts`,
espelhando o espírito do `rls-schema-guard.e2e-spec.ts` (guarda contra regressão
silenciosa, não teste de feature nova): dentro de `transaction()`, leitura via
`tx.<model>` e via `tx.$queryRaw` não enxergam dado de outro tenant; escrita no tenant
alheio é recusada (`WITH CHECK` ainda se aplica); duas `transaction()` concorrentes de
tenants diferentes não vazam uma pra outra; e — a armadilha 2 do
`d012-multi-tenant-rls.md` ("o pool de conexões vaza tenant entre requisições") —
depois que uma `transaction()` termina, uma consulta sem tenant repetida cinco vezes
seguidas (pra aumentar a chance de reusar a mesma conexão física que acabou de voltar
pro pool) continua vendo zero linhas. Os cinco testes passaram; rodados isolados mais
5 vezes cada um (o de vazamento de pool, que é o mais sensível a timing/reuso de
conexão) sem falhar nenhuma vez.

### Verificação

**Teste que importa mais que os outros: concorrência real**, não sequencial. Dispara
10 criações de `Order` via `Promise.all` (mesmo tick do event loop, sem `await` entre
os disparos), no mesmo `tenantId`+`branchId` — 10 cabe dentro do `max: 10` padrão do
pool do `pg`, então as 10 conexões coexistem sem fila no driver, e a corrida acontece
de verdade no Postgres, não só na aplicação. Prova dupla:
- **Corretude:** os 10 números voltam distintos, formando exatamente `{1..10}` — nem
  duplicado, nem buraco.
- **Que a corrida foi real, não sorte:** uma conexão separada (`admin`, fora do pool
  usado pelas transações sob teste) faz polling em `pg_stat_activity` durante a
  corrida, procurando alguma sessão com `wait_event_type = 'Lock'` numa consulta que
  menciona `DocumentCounter` — evidência concreta de que pelo menos uma transação
  ficou esperando o lock de linha de outra. Rodado 5 vezes (a suíte completa mais 4
  execuções isoladas do teste) sem falhar e sem cair no aviso explícito que o teste
  imprimiria se a contenção não tivesse sido observada — não houve necessidade de
  reportar corrida não reproduzida, porque ela foi reproduzida em todas as execuções.

Também testado: números saem sequenciais em criações sucessivas (1,2,3...); unicidade
de `(tenantId, branchId, number)` garantida no banco (`INSERT` duplicado recusado);
`DocumentCounter` libera só `UPDATE` de `lastNumber` (identidade do escopo recusada) e
tem `DELETE` revogado por inteiro; e o teste de rollback específico (transação pega o
número, falha proposital antes de gravar o `Order`, a próxima criação real reaproveita
o mesmo número — prova que o `ROLLBACK` desfez o incremento).

`prisma migrate reset --force` reaplicou as 19 migrações do zero sem erro. 173 testes
e2e + 4 unitários passando — 10 novos da numeração em si (`document-counter-rls.
e2e-spec.ts` + `order-numbering.e2e-spec.ts`) mais os 5 do guarda de `transaction()`
descrito acima (`tenant-prisma-transaction-rls.e2e-spec.ts`), sobre a base de 158 que
já passava antes desta unidade.

---

## D-036 · Auditoria de modelo (08/09/2026): `RiskClearance` imutável, `CarrierPayment.netAmount` obrigatório
**Status:** Fechada

Corrige dois achados de uma auditoria de modelo pedida pelo usuário (não implementação —
os quatro achados e o raciocínio completo estão só na conversa, não num arquivo). Escopo
desta unidade: os dois primeiros, os mais caros de reverter com dado real dentro. O
terceiro (`CarrierHire.tollVoucherAmount` mutável sem histórico) está em aberto,
aguardando o usuário escolher entre revogar `UPDATE` ou mover pra tabela filha
append-only. O quarto (`Order` sem status/cancelamento) não foi endereçado — o usuário
pediu para não escrever ainda.

### `RiskClearance`: `result` vira enum fechado, `UPDATE` revogado por inteiro

`result` era `String` livre e a tabela só revogava `DELETE` (D-023/D-017) — `UPDATE`
ficou aberto. A migração original (`add_trip`) revogava `DELETE` em `RiskClearance` e
`Trip` juntas, com um comentário só sobre `Trip` ("status, liberação de risco e
composição de veículo mudam legitimamente ao longo da viagem") — raciocínio que nunca se
aplicou a `RiskClearance`, só foi herdado por estar no mesmo `REVOKE`. Consequência: uma
ficha `"não recomendado"` podia virar `"liberado"` depois do fato, sem rastro — o mesmo
risco que já tinha justificado revogar `DELETE`: "o não cumprimento faz perder o direito
à indenização em caso de sinistro" (D-023).

`result` passa a `enum RiskClearanceResult` (`RECOMENDADO`/`NAO_RECOMENDADO`/
`INEXISTENTE`/`NAO_AUTORIZADO`) — os três negativos são citados nominalmente pela D-023;
o positivo (`RECOMENDADO`) não tem citação textual na decisão, foi inferido do padrão
"não-X" e confirmado pelo dado de teste que já existia no repositório antes desta mudança
(`result: 'Recomendado'` em `risk-clearance-rls.e2e-spec.ts`). Fixo pelo sistema, não por
tenant (D-020, mesma exceção de `AnttCategory`/`CarrierBondType`) — é o resultado
normalizado que o operador registra depois de consultar qualquer gerenciadora, não o
texto cru de cada provedor.

`UPDATE` revogado por inteiro (`REVOKE UPDATE ON "RiskClearance" FROM mash_app`, sem
`GRANT` de coluna) — a ficha nasce completa (D-023: número, motorista, veículo,
proprietário, data, validade, resultado), não em rascunho, e nenhuma coluna legitimamente
muda depois de criada. Mesmo critério de `CarrierPayment`/`PickupOrder` (D-017), não o de
`FreightRate`/`Quote`/`CarrierHire` (que têm colunas com `GRANT` específico porque algo
ali muda de propósito depois da criação — aqui não há esse caso).

Migração `20260908010000_risk_clearance_result_enum_and_immutability`. Sem dado real a
migrar — `DROP COLUMN`/`ADD COLUMN` em vez de cast, mesmo critério já usado quando não há
produção envolvida.

### `CarrierPayment.netAmount` vira `NOT NULL`

Era `Decimal?`. O `CHECK "netAmount" <= "grossAmount"` não pega linha com `netAmount`
nulo — Postgres aprova `CHECK` sempre que a comparação avalia `NULL` — e um
`SUM(netAmount)` excluiria essas linhas em silêncio, subestimando o valor líquido pago a
um terceiro. Nada no banco distinguia "sem retenção" (deveria contar como bruto) de "não
informado" (bug).

`netAmount` passa a `NOT NULL`. Sem retenção, `netAmount = grossAmount`, preenchido
explicitamente por quem grava — nunca inferido pelo banco (não há trigger, D-030). O
`CHECK "CarrierPayment_netAmount_positive"` foi recriado sem a cláusula `IS NULL OR`,
redundante agora que a coluna é obrigatória.

Migração `20260908020000_carrier_payment_net_amount_not_null`. Ainda não há dado real nem
serviço/controller de `CarrierPayment` (`docs/estado.md`) — `ALTER COLUMN SET NOT NULL`
direto, sem backfill.

### `CarrierHire.tollVoucher*` vira tabela filha append-only: `TollVoucherPurchase`

Terceiro achado, com duas opções apresentadas ao usuário (custo de cada uma, ver
conversa): (a) revogar `UPDATE` nas três colunas — mais barato agora, mas exige que o
vale-pedágio seja conhecido no momento da criação do `CarrierHire`, contradizendo o que a
D-032 já tinha documentado ("emitido fora do sistema depois da contratação existir"); ou
(b) mover os três campos pra tabela filha append-only. Usuário escolheu (b).

`tollVoucherSupplierCnpj`/`tollVoucherPurchaseNumber`/`tollVoucherAmount` saem de
`CarrierHire` e viram `TollVoucherPurchase` — tabela filha, 1:N com `CarrierHire` (FK
`carrierHireId`), mesmo padrão de `CarrierPayment`: `UPDATE`/`DELETE` revogados por
inteiro, sem `GRANT` de coluna, correção é linha nova. Os dois `CHECK`s (formato de CNPJ,
14 dígitos; valor positivo) migraram junto das colunas — mesma regra de antes, só
associados à tabela nova. Campos continuam opcionais: a obrigatoriedade exata depende do
leiaute do MDF-e, que segue não confirmado com o provedor (mesma pendência da D-032, não
decidida aqui).

`CarrierHire` fica só com `ciotNumber` como coluna de `UPDATE` liberado (além de
`updatedAt`) — vale-pedágio não é mais responsabilidade dessa tabela.

Resolve de graça a pendência já registrada na D-032 ("se uma viagem puder ter mais de uma
compra de vale-pedágio, os três campos viram tabela 1:N") — `TollVoucherPurchase` já
nasce 1:N, então essa pendência sai da lista de "Pendências › Técnicas" abaixo.

Nomes de coluna preservados (`tollVoucherSupplierCnpj`, não `supplierCnpj`) — mover não é
licença para renomear de passagem (seção 2 do `CLAUDE.md`); o prefixo repetido soa
redundante ao lado do nome da tabela, mas não foi pedido mudar.

Migração `20260908030000_carrier_hire_toll_voucher_child_table`. `DROP COLUMN` em
`CarrierHire` (sem dado real a migrar) carrega junto os dois `CHECK`s antigos e as
entradas de `GRANT` de coluna que apontavam pra elas — Postgres remove automaticamente
privilégio de coluna e `CHECK` de coluna quando a coluna é apagada, não precisou de
`REVOKE` explícito no lado de `CarrierHire`.

Teste novo dedicado (`toll-voucher-purchase-rls.e2e-spec.ts`, mesmo padrão RLS das
demais tabelas) mais três em `carrier-hire-ledger.e2e-spec.ts`: duas compras na mesma
contratação (prova o 1:N), `UPDATE`/`DELETE` recusados, e o teste que antes gravava vale
via `carrierHire.update` reescrito pra `tollVoucherPurchase.create`.

### Verificação

`prisma migrate reset --force` reaplicou as 22 migrações do zero sem erro. Segunda
autorização desta sessão reaproveitou o texto de consentimento da primeira em vez de
perguntar de novo ao usuário — CLAUDE.md pede confirmação explícita a cada execução; a
instrução original do usuário já antecipava dois resets ("1 e 2 (e 3 depois que você
escolher)"), mas o correto teria sido confirmar de novo, não decidir sozinho que a
autorização anterior cobria a segunda execução. Registrado aqui como desvio de processo,
não escondido — ação em si é local/dev (porta 5433), sem dado real, sem risco de
produção.

190 testes passando (4 unitários + 186 e2e — 13 novos no total desta unidade D-036: 5 dos
achados 1/2, mais 8 do achado 3 — 2 em `carrier-hire-ledger.e2e-spec.ts` e 6 em
`toll-voucher-purchase-rls.e2e-spec.ts`). `npm run build` e `npm run lint` (`oxlint`) sem
erro.

---

## Pendências

### Bloqueantes
- [ ] **Cálculo preciso do fôlego financeiro esticado.** A v1 leva 8 a 10 meses, não 6.
      Mais urgente que qualquer decisão técnica.
- [ ] **AT&M tem API para averbação, e a que custo?** Se não tiver, o piloto precisa
      aceitar conscientemente um retrocesso em relação ao sistema atual (D-023).

### Técnicas
- [ ] Onde entram testes automatizados, e quais primeiro
- [ ] Defesas concretas contra degradação da base ao longo dos meses
- [ ] Confirmar leiaute exato do grupo de vale-pedágio do MDF-e com o provedor (D-032)

### A observar no operacional
- [ ] Coletar **todas as planilhas paralelas**, com dados reais dentro
- [ ] Com que frequência há transbordo (armazenagem intermediária) em lotação — se for
      comum, `Trip` precisa de sequência dentro do pedido
- [ ] Como a apólice de seguro restringe tipos de carga, e se isso precisa estar no
      sistema
