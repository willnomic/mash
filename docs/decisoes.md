# Grupo Mash — Decisões Técnicas

Uma decisão por bloco. Contexto do projeto em `contexto.md`.

**Status possíveis:** `Fechada` · `Assento reservado` · `Em aberto` · `Revogada`

Atualizado em 09/09/2026 (D-044)

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

**Confirmado em campo 07/09/2026 (D-040):** não é mais hipótese — o sócio validou que o
cliente cobra follow-up por e-mail/WhatsApp todo dia, exatamente a dor descrita acima.
Consequência de prioridade (não de modelo — nada construído): passa à frente de D-026
como primeiro item da v1.1.

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
**Status:** Revogada por D-042 (08/09/2026) — ver abaixo

**Fatura agrupa vários CT-e**, não é um a um. Entra na v1 com contas a receber básico.

**Boleto fica fora da v1.** O mecanismo de mercado é arquivo remessa e retorno no padrão
CNAB — largura fixa, variação por banco, e quando falha, falha em dinheiro do cliente.
Relato de campo: integração instável, boletos deixados para trás, cliente sem conseguir
pagar, faturamento atrasado.

**Quando entrar, entra por API de provedor moderno** (Asaas, Cora, Iugu): emissão por
HTTP, confirmação por webhook, sem arquivo posicional. Reduz semanas de bug financeiro a
alguns dias de integração.

**Revisão 08/09/2026 (D-042):** validação de campo com o sócio contradisse as duas
premissas acima — fatura não é mensal (sai logo após a entrega) e boleto não vem de
provedor terceiro (sai do banco da própria transportadora). Ambas as premissas eram
suposição, não evidência, no momento em que esta decisão foi escrita. Conteúdo mantido
abaixo por histórico; D-042 é quem vale.

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

Fora da v1 porque não é necessário para rodar a operação. Forte candidato a ser o que faz
o cliente recomendar o produto.

**Reordenado 07/09/2026 (D-040):** deixa de ser o primeiro item da v1.1 — validação de
campo confirmou que a dor do portal do embarcador (D-010, follow-up/monitoramento) é
diária, contra a periodicidade mensal desta. D-026 continua fechada e vale para v1.1,
só não é mais a primeira da fila.

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

## D-037 · Transbordo: `Trip.sequence`, ordem da perna dentro do `Order`
**Status:** Fechada

Fecha a pendência registrada em "Pendências › A observar no operacional": frequência de
transbordo (armazenagem intermediária) em lotação.

**Respondido pelo sócio, com base nas duas transportadoras da consultoria:** ~15% das
paradas são armazenagem, mais uma fatia de crossdocking — **cerca de 1 em 8 viagens tem
transbordo real**. Pernoite e abastecimento são maioria das paradas, mas não são
transbordo — são evento de viagem única, já coberto por `Occurrence` (D-018). 1 em 8 não
é raridade a ignorar: `Order` → múltiplas `Trip` em sequência precisa de ordem explícita.

`Trip` ganha `sequence` (`Int`, `NOT NULL`) — posição da perna dentro do `Order`.

**Decisões tomadas junto com o sócio:**
- **`(orderId, sequence)` único**, garantido no banco (`CREATE UNIQUE INDEX`, não
  `CHECK` — precisa enxergar outras linhas da mesma tabela).
- **Não precisa ser contíguo.** Perna cancelada pode deixar buraco em `sequence` sem
  qualquer consequência — diferente da numeração de CT-e (D-015), onde buraco exige
  inutilização junto à SEFAZ. Por isso `sequence` é um inteiro atribuído direto pela
  aplicação, **sem** `DocumentCounter` (D-035): não há number de negócio aqui, é só
  ordem interna, e não existe motivo fiscal para fechar o buraco.
- **Encadeamento de endereço fica na aplicação, não no banco.** "Destino da perna N =
  origem da perna N+1" não vira `CHECK` nem trigger: pode haver exceção operacional
  (ex.: um transbordo que não segue o roteiro padrão), e travar isso no banco impediria
  o operador de registrar a exceção real. Mesmo critério de D-030 (regra de negócio na
  aplicação, não em trigger) e da seção 2 do `CLAUDE.md` (não travar o operador por um
  caso que pode ser exceção).

Migração `20260908040000_add_trip_sequence`: `ALTER TABLE "Trip" ADD COLUMN "sequence"
INTEGER NOT NULL` direto, sem backfill (sem linha real na tabela ainda, mesmo critério de
`Order.number`, D-035) + `CREATE UNIQUE INDEX "Trip_orderId_sequence_key"`. Sem
alteração de `GRANT`/`REVOKE`: `Trip` já não tinha nenhuma coluna de `UPDATE` restrita
(D-018 — "status, liberação de risco e composição de veículo mudam legitimamente ao
longo da viagem"), e nada na decisão pede tornar `sequence` imutável.

**Verificação:** `test/trip-sequence.e2e-spec.ts` (novo) — três pernas em sequência no
mesmo `Order` aceitas; `sequence` duplicada dentro do mesmo pedido recusada pelo banco;
buraco na sequência (1 e 3, sem o 2) aceito sem erro. Seis chamadas de criação de `Trip`
em testes/helpers existentes (`trip-composition`, `trip-rls`,
`trip-status-visibility.e2e-spec.ts` + `seed-carrier-hire-scenario`/
`seed-occurrence-scenario`/`seed-pickup-order-scenario`) ganharam `sequence` explícito
para continuar válidas contra a coluna `NOT NULL` nova.

`prisma migrate deploy` aplicou a 23ª migração sem erro sobre o banco de dev existente.
193 testes passando (4 unitários + 189 e2e — 3 novos desta unidade, de 186 pra 189).
`npm run build` e `npm run lint` (`oxlint`) sem erro.

---

## D-038 · `OrderStatus` (achado nº 4 da auditoria D-036) e `Order.customerReference`
**Status:** Fechada

Duas coisas conclusivas de uma planilha operacional real de uma transportadora — o resto
que a planilha sugere fica esperando validação, não entra ainda.

### `OrderStatus`

Fecha o achado nº 4 da auditoria de modelo (D-036): `Order` não tinha como representar
"esse pedido não vale", diferente de `Quote`/`Trip`. Evidência: coluna STATUS da planilha
com `FINALIZADO`/`ANDAMENTO`/`CANCELADO` em uso, várias linhas canceladas de verdade.

Mesmo padrão de `QuoteStatus`/`TripStatus`/`DeductionReason` (D-020): tabela, não enum —
`tenantId` nulo = padrão do sistema, catálogo compartilhado (RLS libera leitura **e**
escrita em `tenantId IS NULL`, não isolamento padrão). Semeados só `IN_PROGRESS`/"Em
andamento", `COMPLETED`/"Finalizado", `CANCELLED`/"Cancelado" — os três que a planilha
comprova, não a taxonomia completa. Código em inglês (D-007), `name` carrega o rótulo em
português (D-008).

**Sem `isPublic`**, diferente de `TripStatus`/`OccurrenceType` — não pedido, e seria
taxonomia especulativa: a distinção interno/público do D-010 hoje mora no status da
*viagem*, nada indica que o portal do embarcador vá filtrar por status do *pedido*.

**GRANT (D-017/D-014, mesmo mecanismo do `Quote`/`FreightRate`):** até aqui `Order` não
tinha nenhum `UPDATE` liberado (migração `20260904075346_add_quote_order`). `statusId` é
a primeira coluna que legitimamente muda depois da criação — libera só ela + `updatedAt`.
`number`, os valores congelados de precificação e as três `Party` seguem fora do alcance
do `UPDATE`. **Cancelar não reabre o número pra reuso (D-015):** `number` nunca entra
neste `GRANT`, e `DocumentCounter` não tem nenhum caminho de código que reaja a mudança
de status — a garantia é estrutural (coluna impossível de tocar via `UPDATE`), não
disciplina de não fazer `UPDATE` nela.

**Consequência obrigatória (não pedida, mas inevitável):** `statusId` `NOT NULL` (mesmo
padrão `Quote`/`Trip` — todo pedido tem status desde que nasce) exige que
`OrderService.createFromQuote`/`createFromFreightRate` atribuam um status na criação —
busca `IN_PROGRESS` por código dentro da mesma transação, mesmo padrão do
`QuoteService.create` buscando `OPEN`. **Não construído:** métodos `finish()`/`cancel()`
no `OrderService` (paralelo a `close()`/`markLost()` do `Quote`) — não foi pedido; o
`GRANT` já deixa o caminho pronto pra quando o fluxo de transição vier.

### `Order.customerReference`

Evidência: planilha organizada pela coluna PROCESSO — referência do cliente (`"PRA
7497/24"`, `"001-OP-I-6403"`, `"32584/25-IMA"`), é por esse número que o operador acha o
pedido o dia inteiro, não pelo `number` interno da transportadora. Campo `String?`
opcional — nem todo cliente manda uma.

**Decisão de índice: GIN trigram (`pg_trgm`), não `btree` simples.** Os formatos da
planilha não têm prefixo comum nem posição fixa — número aparece no meio da string,
formato varia por cliente. Um índice `btree` comum acelera igualdade e `LIKE 'prefixo%'`,
mas não ajuda em "contém" (`LIKE '%pedaço%'`) — cai pra *sequential scan* exatamente no
caso mais provável ("o operador digita um pedaço do número, não o número inteiro").
`CREATE EXTENSION IF NOT EXISTS pg_trgm` + índice `GIN` com `gin_trgm_ops`, consultado via
`contains`/`mode: 'insensitive'` do Prisma (vira `ILIKE '%...%'` no Postgres — planilha
mistura maiúscula/minúscula). Mesma categoria de risco de plataforma gerenciada que o
`btree_gist` do `FreightRate` (D-014) — registrado em `docs/deploy-checklist.md`.

Sem wiring de "encontrar por referência" em endpoint HTTP — não construído ainda, não há
controller de `Order` (`docs/estado.md`). O campo e o índice existem; a busca em si é
consumida hoje só pelos testes, via Prisma direto.

### Migração e verificação

Migração `20260908050000_add_order_status_and_customer_reference`: `OrderStatus`
(tabela+RLS+índice parcial+semente), `Order.statusId`/`customerReference`, `GRANT UPDATE`
por coluna, `CREATE EXTENSION pg_trgm` + índice GIN trigram. Gerada com `prisma migrate
dev --create-only` e editada à mão (RLS/GRANT/semente/extensão não saem do diff
automático) — mesmo fluxo de toda migração deste projeto.

**Nota de processo:** o comando `prisma migrate dev --create-only` **aplicou** a migração
automaticamente ao banco de dev local antes da edição manual (comportamento inesperado do
`--create-only` nesta versão do CLI — não investigado a fundo, registrado aqui pra não
virar afirmação solta) — o arquivo então foi reescrito por cima com RLS/GRANT/semente/
extensão, ficando temporariamente **fora de sincronia** com o que já tinha rodado no
banco. Corrigido aplicando as instruções que faltavam (as adicionadas na edição manual)
direto contra o banco de dev via SQL avulso — ação aditiva (só `CREATE`/`ALTER`/`INSERT`/
`GRANT`, nada de `DROP`), não um `reset`.

**O `prisma migrate reset --force` pedido para verificar a cadeia inteira de migrações do
zero não foi executado nesta sessão** — bloqueado pelo classificador de segurança do modo
automático do Claude Code (ação destrutiva), antes mesmo do próprio guard de consentimento
do Prisma. Diferente do `deploy`, isso não foi contornado — fica pendente de execução
manual pelo usuário (`npx prisma migrate reset --force`, ou `!npx prisma migrate reset
--force` dentro da sessão) pra provar que o arquivo de migração, como escrito, aplica
limpo contra um banco vazio — o que a correção aditiva acima não prova sozinha.

195 testes e2e passando (189 anteriores + 6 novos: `order-status-rls.e2e-spec.ts` e
`order-customer-reference-search.e2e-spec.ts`) + 4 unitários, contra o banco corrigido via
SQL avulso. `npm run build` e `npm run lint` (`oxlint`) sem erro.

---

## D-039 · Agendamento em terminal — fora da v1
**Status:** Fechada · v1.1, junto com contêiner e devolução de vazio (mesmo mundo
portuário)

**Validação de campo (sócio, 07/09/2026):** cada terminal portuário tem portal próprio,
a maioria migrando pra login e senha. O agendamento gera registro no portal do terminal,
com alteração de horário, troca de dados do motorista, exclusão e download de guia de
coleta — que em alguns terminais precisa ser apresentada no gate. Perder a janela gera
cobrança de **No Show**, direcionada ao cliente ou à transportadora conforme o terminal,
e obriga novo agendamento.

**Decisão:** integração com dezenas de portais de terminal distintos fica fora da v1 —
mesma lógica de D-006 (documento fiscal via provedor), D-019 (CIOT/vale-pedágio de
terceiro) e D-023 (gerenciadora de risco): integrar com todos agora é inviável, e o que
mata a planilha paralela é o **registro**, não a integração. Quando construído (v1.1), o
modelo guarda terminal, número/senha do agendamento, janela, motorista informado e
status. No Show entra como custo com responsável definido (cliente ou transportadora,
conforme o terminal) — encaixa na estrutura de custo/venda adicional que a planilha real
já usa, não como campo solto.

**Por quê:** dezenas de portais de terminal, cada um com autenticação e fluxo próprios —
mesmo motivo que já deixou fora da v1 a emissão direta de CT-e (D-006), CIOT/vale-pedágio
(D-019) e a integração com gerenciadora de risco (D-023). O ganho imediato (parar de usar
a planilha paralela) não depende de integração nenhuma, só de registro.

**Consequência:** v1.1, junto com contêiner e devolução de vazio — mesmo mundo portuário,
faz sentido construir junto. Nada construído agora: nenhuma tela, nenhum modelo, nenhuma
integração de agendamento antes disso.

---

## D-040 · Follow-up e monitoramento — confirma D-010, muda prioridade da v1.1
**Status:** Fechada · confirma D-010 (que segue "Assento reservado"), reordena a fila da
v1.1

**Validação de campo (sócio, 07/09/2026):** o operador acompanha trajeto, tempo de
chegada e paradas obrigatórias, e informa o cliente em tempo real. O cliente cobra por
e-mail ou WhatsApp. Onde o rastreador permite, o operador manda link e o cliente consulta
sozinho.

**Decisão:** é a confirmação literal do que D-010 já previa sem validação de campo
("elimina o tráfego de 'cadê minha carga?' no WhatsApp"). A infraestrutura de modelo já
existe — `TripStatus.isPublic` e `Occurrence` (D-018), construídos por antecipação, não
por acaso. Falta: a segunda camada de autorização que D-010 já reserva (embarcador X não
pode ver embarcador Y, mesmo tenant — o RLS de D-012 isola tenant, não embarcador) e a
tela. **Nada disso é construído nesta decisão** — só o registro e a mudança de
prioridade.

**Por quê:** a dor validada é diária (todo cliente, toda carga) — mais frequente que a
dor mensal do controle de combustível (D-026).

**Consequência:** o portal do embarcador (D-010) passa à frente de D-026 como primeiro
item da v1.1. D-026 continua fechada e vale, só deixa de ser a primeira da fila. Nota
correspondente adicionada em D-010 e D-026.

---

## D-041 · Precificação de cotação: caminho de custo, alíquotas com vigência
**Status:** Fechada · alíquota de ICMS marcada a calibrar com o contador (recusa em
código enquanto não calibrada, não só comentário) · margem por dentro/por fora pendente
de validação com o sócio · **contém um erro corrigido em D-043** (IBS/CBS somavam ao
preço incondicionalmente — errado durante a calibragem de 2026; ver D-043)

**Por quê:** validação de campo com o sócio — dor nº 1 do operador é "cálculo de tudo,
margem, imposto, margem de lucro". Cotação para cliente novo (sem tabela de frete) não é
consulta, é montar preço a partir do custo, hoje na calculadora. O modelo só cobria o
caminho de cliente com `FreightRate` fechada — a metade que não dói.

### Onde ancora: `Quote`, dois caminhos mutuamente exclusivos

Confirmado contra o schema antes de modelar: `Quote` já era "etapa opcional... caminho
caso a caso é dela" (D-018), mas sempre pressupunha `FreightRate` (`freightRateId`/
`rate`/`minimumFreight`/`additionalPercentage`/`total` todos `NOT NULL`). Os cinco viraram
opcionais. `Order` não muda — continua só enxergando `Quote` fechada ou `FreightRate`
direta, como já fazia.

- **TABELA** (existente): `freightRateId` preenchido, valores copiados da `FreightRate`
  no `INSERT`, imutável desde a criação — comportamento inalterado.
- **CUSTO** (novo): `freightRateId` nulo, `marginPercentage` + `icmsUf` informados na
  criação (`QuoteService.createCostBased`), linhas em `QuoteCostLine`.
  `total`/`icmsRateApplied`/`ibsRateApplied`/`cbsRateApplied` só existem depois do
  fechamento (`QuoteService.close()`).

`CHECK "Quote_pricing_path_exclusive"` na migração garante que os dois caminhos nunca se
misturam numa mesma linha — testado inclusive por fora do serviço (`admin.quote.create`
direto), não só confiando que `QuoteService` sempre vai chamar certo.

**`icmsUf`, campo novo não pedido explicitamente mas necessário:** ICMS é por UF (pedido
explícito), e nada em `Quote` carregava UF pro caminho de custo (sem `Party`/`Lane` nessa
tabela). Sem esse campo não dá pra escolher a linha certa de `TaxRate`.

### `QuoteCostLine`/`QuoteCostType`

`QuoteCostType`: tabela de domínio, `tenantId` nulo = padrão do sistema, mesmo padrão de
`DeductionReason`/`QuoteStatus` — custo novo é `INSERT`, não migração. Semeados os cinco
citados: `FREIGHT`/"Frete terceiro", `TOLL`/"Pedágio", `FUEL`/"Combustível",
`INSURANCE`/"Seguro", `FEES`/"Taxas".

`QuoteCostLine`: filha de `Quote`, **imutável por inteiro desde a criação** (`UPDATE`/
`DELETE` revogados sem exceção de coluna) — mesmo critério de `PickupOrderItem`/
`CarrierPayment`. "Congela no fechamento" fica satisfeito de graça: a linha nunca foi
editável, então não sobra nada extra pra congelar nela — o que o fechamento congela de
fato (alíquotas, margem já congelada desde a criação, preço) são colunas em `Quote`.

**Alternativa recusada:** linha de custo editável enquanto a `Quote` estiver `OPEN`,
travada só no fechamento (leitura possível do enunciado — "no fechamento... congelam").
Exigiria uma regra condicionada ao status do pai, que ou vira `CHECK` capaz de enxergar
outra tabela (não existe em Postgres) ou trigger de negócio (D-030 proíbe). Imutável desde
sempre entrega o mesmo resultado observável sem inventar mecanismo novo.

### `TaxRate`: alíquota com vigência, sem dono de tenant

Mesmo mecanismo de vigência do `FreightRate` (D-014: sem isso, recotar março em setembro
dá número diferente do cobrado em março — não é hipótese, alíquota muda por lei).

**Alternativa recusada: `tenantId` nulo = padrão do sistema, igual `QuoteStatus`/
`DeductionReason`.** Rejeitada porque não é o mesmo tipo de coisa — aquelas são domínio
que um tenant *pode legitimamente* customizar (D-020); alíquota de tributo não é
configuração de tenant, é lei. Dar a um tenant o poder técnico de "definir sua própria
alíquota" é um risco de compliance que a tabela de domínio nunca teve. `TaxRate` **não tem
`tenantId`** — RLS continua ligado (guarda de schema, D-012 exige em toda tabela), mas com
`USING (true)` (mesmo mecanismo do `SELECT` de `Tenant.slug`, D-029). `mash_app` só tem
`SELECT` — `INSERT`/`UPDATE`/`DELETE` revogados por inteiro: mudar alíquota é migração
revisada, nunca escrita da aplicação. Não inventa autoridade sobre valor de lei (CLAUDE.md
1.6) mesmo que isso feche a porta pra uma tela futura de manutenção de alíquota — não
pedida, e o custo de abrir de novo quando pedida é baixo (é `GRANT`, não redesenho).

`uf` nulo = nacional (IBS/CBS); preenchido = ICMS daquela UF — `CHECK
"TaxRate_uf_matches_tax_type"` amarra isso no banco.

Sobreposição de vigência: `EXCLUDE USING gist` (mesmo `btree_gist` já habilitado desde
`FreightRate`) com `coalesce("uf", '')` no lugar de `uf` puro — sem isso, duas linhas de
IBS (`uf` nulo) nunca colidiriam entre si (`EXCLUDE`, como `UNIQUE`, trata cada `NULL`
como distinto de outro `NULL`), a mesma armadilha que `QuoteStatus`/`DeductionReason` já
resolveram com índice parcial, aqui resolvida dentro do próprio `EXCLUDE`. Testado de
propósito (`tax-rate-validity.e2e-spec.ts`: duas linhas de IBS sobrepostas, ambas com `uf`
nulo, são recusadas) — não bastava confiar no comentário.

### A fórmula: por dentro, aplicada em dois lugares que o pedido não escreveu

O pedido travou a fórmula do ICMS (`preço = base ÷ (1 − alíquota)`, imposto entra na
própria base) e o pipeline em 4 etapas: soma dos custos → recomposição do imposto →
margem → preço. Duas extensões, sinalizadas ao usuário antes de escrever qualquer código
(seção 1.6 do CLAUDE.md pesa aqui — é território de ICMS) e registradas aqui como
**suposição a confirmar com o contador**, não fato:

1. **IBS/CBS entram no mesmo "recomposição do imposto"** — é uma etapa só no pipeline,
   não três. Pool único: `preço_com_imposto = custo ÷ (1 − icms − ibs − cbs)`.
2. **Margem também é "por dentro"** — a única leitura que faz o teste pedido ("margem sai
   igual à pedida depois da recomposição") ser verdade: se margem fosse markup sobre
   custo, essa razão não bateria com a alíquota pedida.
   `preço_final = preço_com_imposto ÷ (1 − margem)`.

**Alternativa recusada:** gross-up sequencial/composto (ICMS primeiro, depois um segundo
gross-up encadeado pra IBS/CBS, depois outro pra margem) em vez de pool único pros três
tributos. Daria um número diferente do pool único e não tem apoio no texto do pedido — o
pipeline descreve UMA etapa de "recomposição do imposto", não três.

Toda a aritmética em `QuotePricingCalculator` (`src/quote/quote-pricing-calculator.ts`) —
função pura, sem banco, precisão cheia em todas as etapas, arredonda só na saída (D-013;
quem arredonda é `QuoteService.close()`, ao gravar `total`, não a função). Percentuais na
mesma convenção de `FreightRate.additionalPercentage`: o número É a porcentagem ("18" =
18%), não fração 0-1.

### Alíquotas semeadas — o que é dado, o que é placeholder

- **IBS 0,1% e CBS 0,9%** (nacional, `uf` nulo): valor dado pelo usuário, citando LC
  214/2025, ano de calibragem 2026 — não inferido de memória fiscal.
- **ICMS, 27 linhas (uma por UF+DF), todas com o MESMO valor: 18,0000%.** Deliberadamente
  uniforme — não é pesquisa de 27 alíquotas reais por estado (CLAUDE.md 1.6: ICMS nunca se
  responde de memória). Um valor uniforme deixa isso visível; 27 números diferentes
  pareceriam pesquisados mesmo com comentário dizendo o contrário — número carrega
  autoridade própria, independente do texto ao lado. **Marcado a calibrar com o contador**
  antes de qualquer cotação real sair do sistema.

### Congelamento

`GRANT UPDATE` novo em `Quote`: `icmsRateApplied`, `ibsRateApplied`, `cbsRateApplied`,
`total` — as quatro colunas que `close()` preenche depois do `INSERT` no caminho CUSTO.
`freightRateId`/`rate`/`minimumFreight`/`additionalPercentage`/`marginPercentage`/
`icmsUf` seguem fora do `GRANT`, nos dois caminhos, sempre. Mesmo padrão de
`FreightRate.validTo`: o banco permite reescrever essas quatro colunas indefinidamente
(não há trava contra fechar a mesma `Quote` duas vezes), disciplina de uso único é da
aplicação — não é lacuna nova, é o mesmo risco aceito já documentado pra `Order.statusId`
(D-038) e `FreightRate.validTo` (D-014).

### `TenantPrisma.transaction()` ganhou um segundo argumento (`tenantId`)

`createCostBased()` cria uma `Quote` do zero, sem nenhuma entidade-pai da qual derivar
`tenantId` (diferente de `OrderService`, que sempre deriva de `freightRate.tenantId` ou
`quote.tenantId`). A alternativa mais simples — `QuoteService` injetar `ClsService`
direto, igual `TenantPrisma` faz internamente — violaria "tenantId nunca aparece no código
de negócio" (comentário já existente em `tenant-prisma.service.ts`) abrindo um segundo
caminho pro mesmo valor. Em vez disso, `transaction()` passou a entregar `tenantId` (que
já calculava internamente pro `set_config`) como segundo parâmetro do callback —
mudança aditiva, compatível com os dois call sites existentes (`OrderService`, que
ignora o segundo parâmetro). `test/tenant-prisma-transaction-rls.e2e-spec.ts` (guarda já
existente) continua verde sem alteração — a mudança não toca RLS.

### Erros corrigidos na mesma sessão, antes de rodar a suíte

- **Drift entre `_prisma_migrations` e o diretório de migrações**, herdado da sessão da
  D-038: o `migrate dev --create-only` desta unidade recusou rodar porque a migração
  `20260908050000_add_order_status_and_customer_reference` tinha sido renomeada de pasta
  (sessão anterior) sem atualizar o nome/checksum gravado no banco. Corrigido com `UPDATE
  _prisma_migrations` (nome, depois checksum recalculado) — ação aditiva/de metadado, não
  um reset. Ver também a pendência de rodar `migrate reset --force` de verdade, abaixo.
- **`ICMS` semeado como `0.1800` (= 0,18%) em vez de `18.0000` (= 18%)** — erro de
  convenção: o padrão do projeto (`additionalPercentage: '2.5'` = 2,5%) guarda o número da
  porcentagem, não uma fração 0-1, e o valor original seguia a convenção errada. Achado
  antes de escrever qualquer teste em cima do valor (checagem cruzada contra
  `additionalPercentage` antes de seguir), corrigido na migração e nas 27 linhas já
  aplicadas no banco de dev, checksum recalculado de novo.
- **`CHECK "TaxRate_uf_matches_tax_type"` foi projetado mas esquecido no arquivo da
  migração** na primeira passada — só o comentário do `schema.prisma` chegou a mencioná-lo
  ("CHECK na migração amarra isso"). Adicionado antes de escrever o teste que prova esse
  CHECK, não depois.

### Verificação

`prisma migrate deploy` aplicou a migração `20260908060000_add_quote_pricing` (25ª) sem
erro. 226 testes passando (9 unitários — 5 novos do `QuotePricingCalculator`, incluindo o
caso conferido à mão custo=810/ICMS 18%+IBS 0,1%+CBS 0,9%/margem 20% fechando em preço
final 1250 sem dízima — + 217 e2e, 22 novos: RLS de `TaxRate` sem fronteira de tenant,
vigência/sobreposição/coalesce/lookup por data, RLS de `QuoteCostType`/`QuoteCostLine`,
caminho de custo ponta a ponta com as alíquotas REAIS semeadas na migração (não valores
forjados no teste), `CHECK` dos dois caminhos misturados). `npm run build` e `npm run
lint` (`oxlint`) sem erro.

**`prisma migrate reset --force` rodado com autorização explícita pedida na hora**
(tarefa separada, não reaproveitando nenhum consentimento anterior — pendência
acumulada desde D-038, agora fechada): as 25 migrações aplicaram limpas contra um banco
vazio, sem erro. `prisma generate` + as duas suítes rodaram de novo depois, contra o
banco recém-resetado: 226 testes passando, `build`/`lint` sem erro — a mesma prova que a
verificação aditiva anterior não dava sozinha.

### Correção 08/09/2026: ICMS por dentro, IBS/CBS por fora — não é pool único

**A recomposição original estava errada.** A primeira versão tratava ICMS, IBS e CBS
como um gross-up único (`custo ÷ (1 − icms − ibs − cbs)`) — os tributos da Reforma
(IBS/CBS) **não** entram na própria base, só o ICMS entra. Corrigido pra duas etapas em
sequência:

1. **ICMS por dentro** (inalterado): `preço_com_icms = custo ÷ (1 − alíquota_icms)`.
2. **IBS/CBS por fora** (correção): somados sobre o preço já com ICMS, sem entrar na
   própria base — soma simples, não gross-up:
   `preço_com_impostos = preço_com_icms + (preço_com_icms × ibs) + (preço_com_icms × cbs)`.

**Por que passou despercebido:** com as alíquotas de calibragem de 2026 (IBS 0,1%/CBS
0,9%), a diferença entre pool único e duas etapas é pequena o bastante pra não aparecer
num teste com poucas casas decimais — exatamente por isso precisava estar certo agora,
antes que a alíquota real (pós-calibragem, não mais teste) tornasse o erro visível só em
produção. `QuotePricingCalculator` ganhou `priceAfterIcms` no retorno — expõe a fronteira
entre as duas etapas, prova que rodaram na ordem certa, não misturadas.

Testes recontados à mão para as duas etapas separadamente (não só o pipeline completo):
etapa 1 isolada (base 100/ICMS 20% → 125, mesmo caso de antes), etapa 2 isolada (custo
1000/IBS 0,1%+CBS 0,9% por fora → 1010 exato — se fosse por dentro, o resultado teria
dízima, 1000/0,99 = 1010,101010…, a ausência de dízima é a prova de que é soma simples).
Caso combinado recalculado: custo 820 (não mais 810 — trocado pra continuar fechando sem
dízima em toda etapa com a fórmula corrigida) → 1000 (etapa 1) → 1010 (etapa 2) → 1262,5
(margem 20%, etapa 3).

### Pendência de validação com o sócio: margem por dentro vs por fora

**Não decidido, propositalmente.** A etapa 3 (margem) continua "por dentro"
(`preço_final = preço_com_impostos ÷ (1 − margem)`) — é a única leitura que faz o teste
"margem sai igual à pedida" ser verdade, mas margem por dentro e margem por fora
(markup simples, `preço_com_impostos × (1 + margem)`) produzem **números diferentes**
pro mesmo "18%" digitado, e qual das duas o operador quer dizer quando pede uma margem
não foi validado em campo — só a fórmula do ICMS veio travada do pedido original, a de
margem foi inferência nossa por analogia. Registrado aqui como pendência (ver
`Pendências › Técnicas` abaixo), não como decisão fechada: não trocar a implementação
sem essa validação, e não tratar "por dentro" como resposta certa só porque já está
escrito — é a implementação atual, não uma alíquota confirmada.

### Placeholder de ICMS: recusa em código, não comentário

**`TaxRate.isPlaceholder`** (coluna nova, migração
`20260908070000_tax_rate_placeholder_flag`) marca as 27 linhas de ICMS semeadas como
placeholder (`true`); IBS/CBS (dado real do usuário, LC 214/2025) nascem `false`.
`TaxRateService.findRate()` **recusa** (lança erro, não avisa) devolver uma linha
`isPlaceholder = true` fora de `NODE_ENV` `development`/`test` — falha fechada: `NODE_ENV`
vazio/ausente também recusa, só `development`/`test` explícitos liberam. Escolhido recusar
em vez de só avisar: um aviso em log pode passar despercebido, uma cotação real não pode
sair com número inventado — "melhor dizer não sei" (CLAUDE.md, regra suprema) pesa mais
que a conveniência de um aviso ignorável.

`NODE_ENV=development` adicionado a `.env.example` — mas o risco real não é "esquecer de
setar produção" (a recusa já falha fechada com `NODE_ENV` vazio): é o oposto, a plataforma
gerenciada (D-005) acabar com `NODE_ENV=development` por engano de deploy ou variável
copiada deste arquivo. Comentário no `.env.example` avisa disso explicitamente.

Verificado (`tax-rate-placeholder-guard.e2e-spec.ts`): recusa com `NODE_ENV=production`,
recusa com `NODE_ENV` ausente, aceita com `development`/`test`, IBS/CBS passam mesmo em
`production` (não são placeholder), e confirma no banco que as 27 linhas de ICMS nascem
`isPlaceholder=true` e IBS/CBS nascem `false`.

### Guarda de schema de RLS: `TaxRate` tratada explicitamente, com o motivo escrito

O teste genérico (`rls-schema-guard.e2e-spec.ts`) só provava RLS **ligado** em toda
tabela, não que a política isola por tenant — `TaxRate` (`USING (true)`, sem fronteira
nenhuma) passava nesse teste do mesmo jeito que uma tabela isolada de verdade, o que
convida a ler "RLS ligado" como "isolado por tenant" incorretamente. Adicionados dois
testes novos no mesmo arquivo, com o motivo escrito no comentário: um confirma que a
política de `TaxRate` é exatamente `USING (true) WITH CHECK (true)` (`cmd = ALL`, não
isolada) — se um dia virar isolada por tenant, é mudança de modelo que merece decisão
própria, não ajuste silencioso que o teste deixaria passar; outro confirma o mesmo
mecanismo já usado em `Tenant.slug` (D-029), pra que as duas exceções fiquem documentadas
lado a lado, não perdidas na varredura genérica.

### Observado, não construído: CT-e exige `valoresPrestacao.componentes`

O CT-e não aceita só um preço total — exige o preço **decomposto em componentes
nomeados** dentro de `valoresPrestacao.componentes` (grupo do XML/schema do CT-e), com
destino fiscal próprio por componente. `QuoteCostLine` cobre o lado do **custo** (o que a
transportadora gasta); falta inteiramente o lado do **preço** — como o `total` da cotação
fechada se decompõe nos componentes que o CT-e exige, e qual vocabulário de componente
cada linha de custo (ou de tributo) mapeia. Isso é trabalho de modelagem novo, não uma
extensão trivial de `QuoteCostLine` — não construído nesta unidade, só registrado aqui
pra não ser descoberto de novo do zero quando a emissão de CT-e (D-006) for construída.

### Verificação (correção 08/09/2026)

Migração `20260908070000_tax_rate_placeholder_flag` (26ª) aplicada sem erro — a mesma
`prisma migrate reset --force` de antes cobre essa migração também (rodada depois dela
existir). 235 testes passando (10 unitários — 1 novo teste de etapa isolada de IBS/CBS
por fora, mais os já existentes recontados — + 225 e2e, 8 novos: recusa/aceita do
placeholder em quatro combinações de `NODE_ENV`, confirmação de `isPlaceholder` no banco,
mais os dois testes novos do guarda de RLS). `npm run build` e `npm run lint` (`oxlint`)
sem erro.

---

## D-042 · Faturamento e contas a receber — revisa D-025
**Status:** Fechada · integração de storage (upload/URL assinada) e serviço/controller
não construídos, próximo passo natural

**Revisa D-025 por completo.** Validação de campo com o sócio contradisse as duas
premissas que a D-025 tinha assumido sem confirmar:

- **Fatura não é mensal.** Sai logo após a entrega — o gatilho é o envio ao cliente da
  foto do canhoto assinado, por e-mail, junto com o boleto e o CT-e, na mesma thread.
- **Boleto não sai de provedor terceiro.** Sai direto do banco da própria
  transportadora, com tarifa já negociada e conta que já existe.
- Cobrança de atraso hoje é o aplicativo do banco (lista vencidos/a vencer); financeiro
  concilia por número de processo e cobra por e-mail, na mesma thread.
- Uma fatura por cliente — o agrupamento é definido pelo CLIENTE, não pela
  transportadora, cada um exige um formato de envio.

### Onde ancora: `Order`, não CT-e (que ainda não existe), não `Trip`

Confirmado contra o schema antes de modelar: `Trip` não carrega nenhum valor — só
`Order.total` existe como preço congelado (D-014). `Order` 1:N `Trip` (transbordo,
D-037) significa que ancorar a fatura em `Trip` exigiria ratear `Order.total` entre
viagens — isso sim seria inventar contorno pela ausência do CT-e (o que foi
explicitamente pedido pra não fazer). `Order` já carrega `total` e `customerReference`
(D-038, o eixo — pedido nº 5 desta unidade). Quando o CT-e for construído (D-018 já
prevê 1:1 com `Trip`), entra como referência opcional, sem reabrir este desenho.

**Sem `InvoiceLine`/tabela de junção.** Evidência é 1 `Order` pertence a no máximo 1
`Invoice` (não N:N) — a FK fica direto em `Order.invoiceId`, uma tabela a menos
(CLAUDE.md seção 2/3.4: tabela nova é último recurso). `GRANT UPDATE` novo em
`invoiceId`, mesmo mecanismo de coluna de `statusId` (D-038).

**O canhoto ancora diferente: em `Trip`, não em `Order`.** Prova de entrega é evento por
entrega física — cada `Trip` tem seu próprio destino (D-018), então cada uma tem seu
próprio canhoto. Intencional, não inconsistência com o parágrafo acima: fatura cobra
pelo pedido, canhoto prova a entrega da perna.

### 1. Boleto: registro entra, emissão fica (reverte a direção da D-025)

Emitir por provedor (Asaas/Cora/Iugu) trocaria a conta em que o dinheiro do cliente cai
— objeção comercial, não técnica, e não vale arriscar o piloto por ela. Mesmo padrão de
D-006 (fiscal via provedor)/D-019 (CIOT)/D-023 (gerenciadora)/D-039 (terminal): o que
mata a planilha paralela é o REGISTRO, não a integração.

`Boleto`: número, vencimento (`Date`, D-016), valor (`Decimal(14,2)`, D-013), linha
digitável (texto livre — layout varia por banco, seção 1.6 não sustenta `CHECK` de
formato). PDF via `Attachment` genérica (`ownerType=BOLETO`), não campo próprio.

1:N com `Invoice`, não 1:1 — mesmo critério de `TollVoucherPurchase` (D-036): barato
modelar 1:N mesmo achando raro mais de um boleto por fatura, caro retrofitar depois com
dado real dentro. Imutável por inteiro (`UPDATE`/`DELETE` revogados) — corrigir é linha
nova, mesmo critério de `PickupOrderItem`.

**Consequência assumida e declarada:** o operador ainda gera o boleto no próprio banco;
o Mash só registra depois. Mesma consequência já aceita em D-019 pro CIOT.

### 2. `ReceivableEvent`: livro de eventos append-only, espelha `CarrierPayment` (D-032)

Nunca coluna de saldo, nunca coluna de status — "quanto falta receber" é sempre
`SUM(order.total)` dos pedidos da fatura menos `SUM` sinalizado dos eventos, derivado em
consulta. `UPDATE`/`DELETE` revogados por inteiro (não `GRANT` de coluna): nenhuma
coluna muda legitimamente depois de criada — mesmo critério exato de `CarrierPayment`,
não o de `FreightRate`/`Quote`/`CarrierHire` (que têm coluna liberada porque algo ali
muda de propósito depois da criação).

**Tipo menor que o de `CarrierPayment`, de propósito:** só `PAYMENT`/`REVERSAL`, sem
`ADVANCE`/`DEDUCTION` — a validação fala de conciliar pagamento e cobrar atraso, não de
adiantamento nem desconto negociado do lado do recebível. Não inventar taxonomia que a
evidência não pede.

`reversesReceivableEventId` amarra `REVERSAL` ao evento que desfaz — `CHECK` nos dois
sentidos e índice único parcial contra estorno duplicado, mecanismo idêntico ao
`CarrierPayment.reversesPaymentId` (D-032/correção 05/09/2026), sem reinventar.

**Por que nasce como livro de eventos mesmo com boleto registrado manualmente:** quando
a emissão por API entrar (a D-025 original, agora fora de escopo, não descartada — só
adiada), ela vira só mais um consumidor do MESMO livro, não uma migração de dado
financeiro. O desenho não muda quando a integração chegar.

### 3. `Attachment`: decisão nova — nada no sistema fazia isso antes

Canhoto é o GATILHO do faturamento — sem ele, não fatura. Não se regenera (diferente do
PDF de `PickupOrder`/D-034, gerado sob demanda, nunca gravado, e do XML fiscal, texto
pequeno que cabe no Postgres): é foto de celular, ~500/mês por transportadora, binário
grande demais pro banco de aplicação.

**Storage de objeto: Cloudflare R2**, decidido pelo usuário depois de eu apresentar três
opções (não escolhido sozinho, como pedido) — API compatível com S3 (mesmo SDK/código
de uma eventual migração pra S3 real), custo de armazenamento baixo (~US$0,015/GB/mês) e
**zero custo de egress**, o que importa quando o download passar a ser frequente (ex.:
portal do embarcador, D-010, quando o cliente puder baixar o próprio canhoto). Nem
Railway nem Render (D-005) tem produto de object storage próprio — a escolha independe
de qual dos dois for fechado.

**Não construído nesta unidade: a integração real** (upload, geração de URL assinada de
download). Sem bucket/credencial pra testar contra algo de verdade, código de integração
seria inventado, não verificado (CLAUDE.md 1.4) — contra o próprio princípio que rege
este projeto. `objectKey` é só o texto opaco que quem subir o arquivo vai escrever; a
tabela de metadado não sabe nem precisa saber o formato da chave. Fica pra quando a
credencial existir.

`ownerType`+`ownerId` é referência **polimórfica, sem FK** — Postgres não tem FK que
aponte pra "uma linha dentre várias tabelas possíveis" sem uma tabela de referência
global que não existe aqui (criar uma só pra isso seria estrutura que ninguém pediu).
Validar que `ownerId` existe de verdade e pertence ao tenant é regra de aplicação
(D-030), mesmo critério já aceito em `PickupOrder.addressId`. `type` é dimensão separada
de `ownerType` de propósito — a mesma entidade dona pode um dia ganhar um segundo tipo de
anexo (ex.: foto de avaria em `Trip`) sem tabela nova.

**RLS continua sendo o único guarda** (pedido explícito) — sem segunda camada de
autorização agora. Já nasce no formato que a D-010 vai precisar quando o embarcador
puder baixar o próprio canhoto, mas nenhuma tela nem segunda autorização é construída
aqui. Append-only: `UPDATE`/`DELETE` revogados por inteiro.

### 4. Agrupamento definido pelo cliente: campo mínimo, não taxonomia

`Party.invoicingPreference` — texto livre, opcional. Evidência ("cada cliente exige um
formato de envio") não sustenta uma estrutura de ciclo (semanal/mensal/por volume/etc) —
só um lugar pra anotar a preferência. Alternativa recusada: enum ou tabela de domínio de
"ciclo de faturamento" — inventaria taxonomia que a validação não pediu (CLAUDE.md seção
2).

### 5. Número de processo é o eixo

`Order.customerReference` (D-038) já existe com índice GIN trigram (D-038) — nada novo
construído aqui, só confirmado que fatura (`Order.invoiceId`), cobrança
(`ReceivableEvent` via `invoice.orders`) e canhoto (`Attachment` via `order.trips[]`)
seguem alcançáveis a partir dele, um ou dois `include` de distância. Testado em
`invoice-rls.e2e-spec.ts`.

### O que não foi construído (por pedido explícito)

Emissão de boleto, CNAB, integração bancária, conciliação automática de pagamento,
qualquer tela, envio de e-mail, régua de cobrança automática — nenhum dos seis. Também
não construído, por decisão desta sessão (não do pedido original): serviço/controller de
`Invoice`/`Boleto`/`ReceivableEvent`/`Attachment` — mesmo padrão já aceito pra
`CarrierHire`/`CarrierPayment` (D-032: modelo e teste, sem serviço, até existir uso real
que peça um) — e a integração de storage real (ver seção 3 acima).

### Migração e verificação

Migração `20260908080000_add_invoicing` (27ª): `Party.invoicingPreference`,
`Order.invoiceId` (+ `GRANT UPDATE`), `BusinessDocumentType` ganha `INVOICE` (aditivo,
`ALTER TYPE ... ADD VALUE`, já antecipado desde D-015/D-035), `Invoice`/`Boleto`/
`ReceivableEvent`/`Attachment` com RLS padrão (D-012), `CHECK`s de estorno e valor
positivo, índice único parcial contra duplo estorno. Aplicada sem erro contra o banco de
dev.

267 testes passando (14 unitários — 4 novos, `.plus()`/`.minus()` na soma sinalizada de
`ReceivableEvent` — + 253 e2e, 39 novos: RLS/imutabilidade de `Invoice`/`Boleto`/
`ReceivableEvent`/`Attachment`, `CHECK` de estorno nos dois sentidos, duplo estorno
recusado, valor zero/negativo recusado, saldo por `SUM` com e sem estorno, "download" de
outro tenant recusado na consulta que qualquer geração futura de URL assinada
precisaria fazer primeiro, dois `ownerType` diferentes de anexo aceitos). `npm run
build` e `npm run lint` (`oxlint`) sem erro.

---

## D-043 · Correção da D-041 e ampliação do `TaxRate` — com base em consulta contábil
**Status:** Fechada · corrige um **erro** da D-041 (não é atualização — o pipeline
cobrava IBS/CBS do cliente incorretamente durante a calibragem de 2026) · alíquotas
internas de ICMS por UF continuam placeholder, a calibrar com o contador · regime
tributário do tenant e apuração de IBS/CBS ganham assento reservado, sem fluxo
consumidor construído

**Evidência:** texto integral da consulta contábil copiado em
`docs/consulta-tributaria-2026-09.md` antes de qualquer alteração de código — cada
mudança abaixo cita a seção correspondente daquele arquivo.

### Erro corrigido: IBS/CBS não compõem o preço durante a calibragem (2026)

A D-041 somava IBS/CBS ao preço do cliente sem condição (`priceBeforeMargin` sempre
incluía os dois). A consulta contábil corrige: durante a calibragem (2026), IBS/CBS são
**informativos** — calculados, destacados no documento, mas **não entram na cobrança**.
ICMS/ISS seguem dedutíveis da própria base de IBS/CBS até 2032; só depois disso os
tributos novos passam a compor preço de fato.

**Correção:** `TaxRate.composesPrice` (coluna nova, `Boolean @default(true)`,
`prisma/schema.prisma:633`) — se a linha de alíquota compõe preço vira **parâmetro com
vigência**, não constante no código. As linhas de IBS/CBS semeadas nesta migração nascem
`composesPrice=false`. `QuotePricingCalculator`
(`src/quote/quote-pricing-calculator.ts`) sempre **calcula** `ibsAmount`/`cbsAmount`
(o destaque no documento não muda) mas só soma ao preço quando o parâmetro é
`true` — `.plus(input.ibsComposesPrice ? ibsAmount : new Decimal(0))`.

**Prova pedida explicitamente no pedido — número conferido à mão:** custo 820, ICMS 18%
por dentro → 1000; margem 20% por dentro → 1250. Com `composesPrice=true` para IBS/CBS
(0,1%+0,9%) o preço subiria pra 1262,5 (`quote-pricing-calculator.spec.ts`); com
`composesPrice=false` (o caso real de 2026) o preço fica em 1250 — **idêntico** ao caso
sem IBS/CBS nenhum, provando que "ligar" ou "desligar" o parâmetro em 2026 não muda o
preço cobrado do cliente, só o que aparece destacado no documento. Recomputado também
ponta a ponta contra o banco real (`test/quote-cost-based.e2e-spec.ts:95`: `total` = 1250,
não mais 1262,5).

### Gross-up não é universal — os dois caminhos não chamam a mesma função

`preço = base ÷ (1 − alíquota)` só vale quando o ponto de partida é um valor de custo a
recompor (caminho CUSTO da D-041). Quando o preço já é o valor combinado (caminho TABELA,
`FreightRate`), a base é o próprio valor e o tributo só é **multiplicado**, nunca
recompõe a base — dividir aqui infla o preço além do combinado, erro oposto ao de
IBS/CBS acima.

Confirmado que os dois caminhos não compartilham a mesma função: `close()` do caminho
CUSTO chama `calculateQuotePricing` (gross-up); o caminho TABELA nunca chamou —
`FreightRate` já grava valor final direto, sem recomposição nenhuma (D-041, inalterado).
Para deixar essa separação impossível de confundir por engano futuro, o caminho de
"tributo sobre valor já acordado" ganhou função própria,
`calculateTaxOnAgreedValue` (`src/tax-rate/tax-composition-calculator.ts`) — pura
multiplicação, `finalPrice === value` sempre. **Não foi ligada a nenhum caminho de
produção** (nenhum dos dois caminhos hoje precisa dela de fato — `FreightRate` já é
valor final sem destaque de tributo); existe só como o lugar certo pra esse cálculo
quando for pedido, evitando que alguém reuse `calculateQuotePricing` (gross-up) por
analogia errada. `test/tax-composition-calculator.spec.ts` prova a matemática **e**,
via leitura do código-fonte de `quote.service.ts`, que ele importa `calculateQuotePricing`
e não importa `calculateTaxOnAgreedValue` — não é só convenção em comentário.

### `TaxRate` ganha os três casos de ICMS — sem matriz 27×27

A consulta descreve três operações de ICMS com regras de alíquota inteiramente
diferentes; o modelo anterior (D-041) só cobria "ICMS por UF", implicitamente a interna.

- **Interna** (`icmsOperationType: 'INTERNA'`) — origem e destino na mesma UF, alíquota
  por UF (17-22%, varia por lei estadual). Continua exigindo `uf` preenchido e
  **continua placeholder** (`isPlaceholder=true`) — a consulta não trouxe as 27 alíquotas
  reais, e não seria apropriado inventá-las (CLAUDE.md 1.6). O guard de
  `TaxRateService.findRate()` que recusa placeholder fora de dev/test (D-041) segue
  intacto e agora escopado só às linhas `INTERNA` — `IBS`/`CBS` e as duas linhas
  interestaduais abaixo não são placeholder (dado real da consulta), então não podem
  mais ser varridas pela mesma checagem "toda linha de ICMS é placeholder"; o teste que
  provava isso foi re-escopado (`tax-rate-placeholder-guard.e2e-spec.ts`).
- **Interestadual** (`icmsOperationType: 'INTERESTADUAL_7'`/`'INTERESTADUAL_12'`, `uf`
  nulo) — regra da Resolução do Senado: 7% quando origem é Sul/Sudeste **exceto ES** e
  destino é Norte/Nordeste/Centro-Oeste/ES; 12% em qualquer outro par origem/destino.
  Modelado como **grupo de UF**, não matriz: `SUL_SUDESTE_EXCETO_ES` (constante
  `Set<string>` — geografia fixa por lei, mesmo critério que mantém listas fixas como
  enum/constante em vez de tabela, D-020) em
  `src/tax-rate/tax-rate.service.ts:24`; `findInterstateIcmsRate()`
  (`tax-rate.service.ts:92`) testa pertencimento nos dois lados, não indexa uma tabela
  27×27. As duas linhas (7%/12%) nascem `isPlaceholder=false` — vieram da consulta, não
  são chute. Vigência partilha a mesma `EXCLUDE USING gist` de sobreposição já usada
  desde D-041, agora particionada também por `icmsOperationType` (sem isso, a linha
  `INTERNA` de uma UF colidiria com as duas interestaduais, todas de `taxType=ICMS`).
- **Intramunicipal** (mesmo município origem/destino) — **sem ICMS**. Não é linha de
  `TaxRate` (não tem vigência própria, é fronteira de competência tributária estrutural,
  ISS e não ICMS): constante `ICMS_INTRAMUNICIPAL_RATE = new Prisma.Decimal(0)`
  (`tax-rate.service.ts:15`).

`CHECK "TaxRate_icms_operation_type_required"` (ICMS exige `icmsOperationType`; IBS/CBS
exigem nulo) e `CHECK "TaxRate_uf_matches_operation_type"` (INTERNA exige `uf`;
interestadual exige `uf` nulo) — os dois testados por `tax-rate-validity.e2e-spec.ts`.

**Erro achado e corrigido antes de commitar, registrado aqui porque é o tipo de bug que
falha em silêncio:** a primeira versão do segundo CHECK escreveu
`("icmsOperationType" = 'INTERNA' AND "uf" IS NOT NULL) OR (...) OR ("icmsOperationType"
IS NULL AND "uf" IS NULL)` sem guarda explícita de `IS NOT NULL` nos dois primeiros
ramos. Quando `icmsOperationType` é `NULL` (caso de uma linha IBS/CBS mal formada com
`uf` preenchido por engano), a comparação `"icmsOperationType" = 'INTERNA'` avalia pra
`NULL`, não `FALSE` — e `NULL OR FALSE OR FALSE` também é `NULL`. Postgres trata `CHECK`
que avalia `NULL` como **satisfeito**, não violado — a lógica de três valores do SQL
deixando passar exatamente o caso que o CHECK existia pra barrar. Achado por um teste
que esperava rejeição e via sucesso (`recusa IBS/CBS com uf preenchido`), confirmado por
INSERT isolado direto no banco (bypassando Prisma) e por `\d+ "TaxRate"` (descartando
divergência de deploy). Corrigido adicionando `"icmsOperationType" IS NOT NULL AND` como
guarda nos dois primeiros ramos, forçando avaliação `FALSE` definitiva em vez de
propagação de `NULL`. Migração e banco de dev corrigidos juntos, checksum recalculado
(mesmo padrão já usado em D-041 pra bug em migração da mesma sessão, ainda não
commitada).

### Regime tributário do tenant — assento reservado, fluxo não construído

CST de ICMS é `00` (regime normal, Presumido/Real) ou `90` (Simples Nacional, com
indicador de contribuinte separado) — não existe CSOSN em CT-e. Empresa do Simples ainda
recolhe ICMS **fora do DAS** em transporte intermunicipal/interestadual (só o
intramunicipal entra no DAS); IBS/CBS são obrigatórios pra Presumido/Real e opcionais
pra Simples/MEI em 2026; a partir de 2027 o "Simples Híbrido" (LC 214/2025) permite
apurar IBS/CBS fora do DAS — regime de apuração de IBS/CBS é, portanto, campo
**separado** do regime de imposto de renda.

**"Reserva o assento, não constrói o fluxo"** (instrução explícita do pedido): `Tenant`
ganhou três colunas, todas nullable, nenhuma consumida por lógica de negócio ainda —
`incomeTaxRegime IncomeTaxRegime?` (enum novo, `SIMPLES_NACIONAL`/`LUCRO_PRESUMIDO`/
`LUCRO_REAL` — fixo por lei, não domínio de tenant, D-020), `isSimplesIcmsContributor
Boolean?`, `ibsCbsApurationRegime String?` (`prisma/schema.prisma:37,44,54`).
`ibsCbsApurationRegime` é string livre, não enum — decisão pedida ao usuário
explicitamente (não fechar uma lista de regimes de apuração ainda incompleta; abrir enum
depois é migração simples quando os outros regimes aparecerem). Testado só que o campo
nasce nulo e aceita ser preenchido (`tenant-rls.e2e-spec.ts:84`) — nenhum serviço lê ou
decide com base neles ainda.

### `IbsCbsTaxSituation` — CST/`cClassTrib` como tabela de domínio, não constante

CST + `cClassTrib` do CT-e não é par fixo: o caso padrão de transporte rodoviário de
carga totalmente tributado é `000`/`000001`, mas a tabela oficial tem mais de 160
combinações, atualizada por Nota Técnica periódica — o oposto de uma constante de
código. Modelado como tabela de domínio (`prisma/schema.prisma:661`), mesmo critério de
`QuoteCostType` (D-041): `tenantId` nulo = padrão do sistema, RLS permite leitura de
qualquer tenant nas linhas `tenantId IS NULL` e escrita das próprias — diferente de
`TaxRate`, que a D-041 rejeitou como domínio por ser lei, não escolha do tenant; aqui o
critério que se aplica é o oposto: um tenant pode legitimamente precisar de um código
que o sistema não semeou. Semeada **só** a linha padrão (`000`/`000001`, "Tributação
integral — transporte rodoviário de carga") — as demais ~160 não são inventadas.

**Pendência registrada** (não resolvida aqui): a tabela oficial do Portal Nacional muda
por Nota Técnica — não há mecanismo de atualização periódica automática, ver
`Pendências › Técnicas` abaixo.

### Registrado, não construído: crédito presumido de 20% (Convênio ICMS 106/96)

A consulta é explícita: o crédito presumido de 20% é benefício de **nível de apuração**
(mensal, na conta corrente fiscal da transportadora) — não altera o `vICMS` destacado no
CT-e em si, é opção do contribuinte, substitutiva de outros créditos, e não se aplica a
transporte aéreo. **Não é campo de documento fiscal.** Registrado aqui explicitamente
como fora do escopo de `TaxRate`/CT-e, pra não ser reintroduzido por engano numa sessão
futura como se fosse alíquota do documento.

### Desvio de processo: migração já aplicada foi editada, não substituída por migração nova

**Registrado como desvio, não como padrão a repetir.** Ao corrigir o `CHECK
"TaxRate_uf_matches_operation_type"` (bug de lógica de três valores descrito acima), a
correção foi aplicada **editando o arquivo da migração `20260909000000_...` já aplicada**
no banco de dev, com o `DROP`/`ADD CONSTRAINT` corrigido também rodado direto contra o
banco e o checksum em `_prisma_migrations` **regravado manualmente** (`UPDATE` via
`psql`) pra fazer o hash bater com o arquivo editado de novo.

Isso contorna a proteção do próprio Prisma Migrate: o checksum gravado existe
exatamente pra detectar quando o arquivo de uma migração já aplicada foi alterado depois
do fato — reescrever o checksum manualmente apaga esse sinal. **A regra correta,
sempre, é: migração aplicada não se edita — corrige-se com uma migração nova**, mesmo
que a nova seja só `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...` de duas
linhas.

**Por que foi aceito aqui, uma vez, sem repetir:** a migração `20260909000000` era desta
mesma sessão, ainda não commitada, e o bug foi achado por teste antes de qualquer commit
existir — não havia, em nenhum momento, uma migração "publicada" (commitada, ou aplicada
em qualquer banco além do de dev local) rodando com o CHECK errado. Editar o arquivo
manteve a migração da sessão como uma unidade só, em vez de deixar um `CHECK` errado
seguido de um `ALTER` corretivo dois minutos depois no histórico — mas isso não
generaliza: se a migração já tivesse sido commitada, ou aplicada em qualquer banco
compartilhado, a correção teria que ser uma migração nova, sem exceção.

**Prova exigida e obtida antes de fechar esta decisão:** `npx prisma migrate reset
--force` (autorização explícita do usuário, na hora, banco de dev local sem dado real —
não reaproveitando consentimento de sessão anterior) — as 28 migrações aplicaram limpas
contra um banco vazio, na ordem, com o arquivo exatamente como está escrito hoje. Prova
que o checksum regravado manualmente **de fato corresponde** ao conteúdo real do arquivo
(a regravação manual, por si, não garante isso — só o reset do zero prova). `prisma
generate` + as duas suítes rodaram de novo depois, contra o banco recém-resetado: 286
testes passando (22 unitários + 264 e2e), `build`/`lint` sem erro — mesma prova de novo
que a verificação aditiva (aplicar sobre um banco já em uso) não dava sozinha, mesmo
critério já registrado em D-041 pra situação parecida.

### Verificação

Migração `20260909000000_tax_correction_and_expansion` (28ª): `IcmsOperationType`
(enum), `TaxRate.icmsOperationType`/`composesPrice`, `IbsCbsTaxSituation` (RLS +
índice único parcial + seed), `IncomeTaxRegime` (enum), três colunas novas em `Tenant`,
dois `CHECK` novos em `TaxRate` (o segundo corrigido antes de commitar, ver acima),
`EXCLUDE` de vigência recriado particionado por `icmsOperationType` (usando `CASE`
literal em vez de `coalesce(col::text, '')` — o cast de enum pra texto dentro de índice
funcional quebra com "functions in index expression must be marked IMMUTABLE", achado
por reprodução isolada contra o banco antes de aplicar na migração real), duas linhas de
ICMS interestadual semeadas (7%/12%, `isPlaceholder=false`), backfill de
`composesPrice=false` nas linhas IBS/CBS existentes e `icmsOperationType='INTERNA'` nas
27 linhas de ICMS existentes. Aplicada sem erro contra o banco de dev — inclusive via
`prisma migrate reset --force` do zero (ver desvio de processo acima), não só de forma
aditiva sobre um banco já em uso.

286 testes passando (`npm test`: 5 arquivos/22 unitários + `npm run test:e2e`: 55
arquivos/264 e2e — 60 arquivos, todos verdes), **confirmado duas vezes**: uma vez
aditivamente logo após a correção do `CHECK`, outra vez do zero depois do `migrate reset
--force`. `npm run build` e `npm run lint` (`oxlint`) sem erro nas duas rodadas.

---

## D-044 · Avaliação de provedor de documento fiscal — Focus NFe escolhida
**Status:** Fechada (escolha de provedor) · integração/adaptador **não construído** —
D-006 segue não iniciada; MDF-e da avaliação **não concluído** (pendência registrada
acima)

**Evidência:** teste real em ambiente de homologação, não leitura de material de venda
do provedor. Detalhe completo, requisição/resposta crua de cada chamada, em
`docs/RESULTADO.md` e `docs/CAMPOS-FALTANTES-MASH.md` (copiados de uma avaliação
dedicada, `C:\focus-nfe-eval`, pra dentro do projeto — são a especificação do futuro
adaptador de CT-e/MDF-e, não só um relatório de avaliação).

**Confirmado por execução real contra a Focus NFe:**
- Idempotência por `ref`: reenviar a mesma referência não duplica documento — nem em
  sequência (já autorizado → `409`), nem em condição de corrida real (duas chamadas
  paralelas → uma `202`, outra `422 pending_operation`, nunca as duas autorizando).
- Recuperação após timeout: uma emissão abortada do lado do cliente (`curl --max-time`)
  continuou processando no servidor — consultando só pelo `ref` que a própria aplicação
  gerou (nenhum ID do provedor) dá pra recuperar o destino real do documento.
- Numeração explícita é respeitada: `numero` enviado pela aplicação sai exatamente como
  enviado; aceita salto na sequência (sem validação de contiguidade); recusa
  duplicidade só contra número **já autorizado** — rejeição não consome o número
  (reenvio com o mesmo `numero` depois de uma rejeição autoriza normalmente).
- XML autorizado vem com o protocolo de autorização **embutido no próprio arquivo**
  (`cteProc` contém `CTe` e `protCTe` juntos) — confirmado abrindo o XML baixado, não só
  pela presença do campo na resposta JSON.

**Achado de negócio não documentado, achado por execução:** cancelamento de CT-e é
**vedado** se já existir uma carta de correção (CC-e) no mesmo documento — regra real da
SEFAZ, não encontrada em nenhuma página lida antes de executar. Se o Mash modelar "pode
cancelar" como pergunta simples, essa regra precisa entrar.

**Mensagem de rejeição vem crua da SEFAZ** (`status_sefaz` + `mensagem_sefaz` com o
texto oficial, ex. "Rejeicao: Data de Emissao muito atrasada") — não traduzida nem
parafraseada pela Focus. Uma tela que mostrar isso ao operador precisa decidir se
traduz/explica ou repassa cru.

**Alternativas descartadas, com motivo:**
- **Nuvem Fiscal** — empresa desativada em 31/07/2026. Fora de cogitação, não é questão
  de comparação técnica.
- **PlugNotas** — não cobre CT-e. Elimina de saída pra este caso de uso (transporte de
  carga lotação depende de CT-e/MDF-e, não é NF-e de venda de mercadoria).

**Por quê:** D-006 (emissão de CT-e/MDF-e via provedor terceirizado) precisava de
provedor real escolhido antes de desenhar o adaptador — sem isso, qualquer modelagem de
`CTe`/`MDFe` no schema seria feita às cegas sobre um layout de campo que "parece"
razoável em vez de confirmado. CLAUDE.md 1.6 pesa aqui: layout de campo de documento
fiscal se lê na documentação do provedor (e se testa contra ela), não se deduz.

**Consequência:** quando D-006 for construída, o adaptador de CT-e/MDF-e é contra a
Focus NFe — `docs/CAMPOS-FALTANTES-MASH.md` já é o inventário de campos que faltam no
schema atual pra isso, `docs/RESULTADO.md` já documenta o comportamento real da API
(idempotência, numeração, eventos, arquivos). **Nada disso constrói o adaptador agora**
— é a base pra quando construir. MDF-e continua com uma lacuna real não resolvida (o
campo do veículo de tração não foi localizado na documentação pública de campos, nem a
alíquota de IBS-UF que a SEFAZ de homologação valida) — perguntas enviadas ao suporte da
Focus, aguardando resposta (pendência registrada abaixo).

---

## D-045 · `DayPeriod` e janela de tempo estruturada em `PickupOrder`
**Status:** Fechada

Fecha a pendência técnica "janela de tempo em linguagem natural" (registrada abaixo, em
Pendências) — o tipo `TimeWindow` já existia em `@mash/shared`
(`shared/src/time-window`, commit `bf7f5ea`), esta unidade materializa ele no schema.

**`DayPeriod`:** mesmo padrão de `OrderStatus`/`QuoteCostType` (D-020/D-038) — tabela,
não enum, `tenantId` nulo = padrão do sistema, catálogo compartilhado (RLS libera
leitura **e** escrita em `tenantId IS NULL`). Nove códigos semeados, todos confirmados
em dado real (planilha operacional de 2025, `shared/src/time-window/
time-window.parser.ts`) — não a taxonomia completa, mesmo critério que já semeou só três
`OrderStatus` e dois `TripStatus`. `code` em inglês (D-007), `name` carrega o rótulo em
português (D-008) — é esse rótulo que `formatTimeWindow` usa (o pacote compartilhado não
guarda tradução).

**`PickupOrder`:** `pickupWindow` renomeado pra `pickupTimeNote` (`ALTER ... RENAME
COLUMN`, não `DROP`+`ADD` — mesmo critério de D-031/D-033: sem dado de produção, mas o
histórico da coluna importa). Colunas novas, todas nullable, sem backfill:
`pickupStartTime`/`pickupEndTime` (`VARCHAR(5)`, texto `"HH:mm"`), `pickupEndsNextDay`
(`BOOLEAN NOT NULL DEFAULT false`), `pickupDayPeriodId` (FK pra `DayPeriod`, `ON DELETE
RESTRICT`). `pickupDate` (já existia, `NOT NULL`) virou `NULLABLE` — existem
`PickupOrder` de teste sem data; vira `NOT NULL` de novo quando a tela for a única porta
de criação. **Registrado como o que é: justificativa de fixture, não de negócio.** Ordem
de coleta sem data não faz sentido operacional; a restrição foi enfraquecida por
conveniência de teste, e essa linha existe pra que ninguém precise redescobrir isso.

**Hora como texto, não `time` nativo do Postgres:** `@db.Time` do Prisma volta pro
TypeScript como objeto `Date` com data de `1970-01-01` embutida, reabrindo a confusão de
fuso que a D-016 manda evitar — hora sem data ganharia fuso implícito de novo. `@mash/
shared` já trata hora como string em todo o pacote. `"HH:mm"` com zero à esquerda ordena
corretamente em comparação lexicográfica de texto, então os CHECK abaixo funcionam no
banco exatamente como funcionariam com um tipo de hora nativo. Isto é uma **exceção
deliberada à D-016** (que manda `timestamptz` sempre, com `date` puro só pra data de
calendário) e está registrada como exceção de propósito: "8h no terminal de Itapoá" é
hora de parede local acordada com um lugar, e guardar como instante exigiria conhecer o
fuso do endereço no momento da digitação, produzindo precisão que ninguém combinou. O
instante se deriva quando for preciso (alerta de janela fechando), usando a UF do
endereço. Sem esse motivo escrito, alguém troca por `timestamptz` daqui a seis meses
achando que foi descuido.

**`endsNextDay` em vez de uma segunda coluna de data:** 27 células do dado real cruzam
meia-noite (`22H00 A 00H00`). Com duas datas, toda consulta de "o que tem pra hoje"
teria que escolher qual das duas usar — e alguém escolheria errado. Com data âncora mais
sinalizador, a âncora é sempre o dia do serviço, sem ambiguidade em filtro, ordenação e
agrupamento. O `24:00:00` que o Postgres aceita foi recusado por ser valor de borda que
se comporta mal em aritmética de intervalo.

**Cinco `CHECK` — as invariantes de `TimeWindow` impostas no banco, não só no
TypeScript** (mesmo princípio do `TaxRate`, D-043: a garantia mora onde o dado é
escrito): formato `"HH:mm"` válido; `dayPeriodId` preenchido exclui horário (start/end
nulos, `endsNextDay` falso); `endsNextDay` verdadeiro exige start E end preenchidos;
`endsNextDay` verdadeiro exige `end < start`; `endsNextDay` falso com os dois
preenchidos exige `end >= start`. Cada comparação que pode receber `NULL` é guardada
explicitamente com `IS NOT NULL`/`IS NULL` antes de `=`/`<`/`>=` — sem a guarda, o
Postgres trata `CHECK` que avalia `NULL` como satisfeito, não violado (o mesmo bug real
já apareceu num `CHECK` parecido do `TaxRate`, D-043, só pego por teste). Testado o caso
`NULL` de cada uma das cinco (`test/pickup-order-time-window-check.e2e-spec.ts`, 19
testes).

**PDF (D-027):** `PickupOrderService.generatePdf` passa a chamar `formatTimeWindow` de
`@mash/shared` quando há algo estruturado (horário ou período), com o rótulo vindo de
`DayPeriod.name`, e cai em `pickupTimeNote` quando não há nada estruturado (inclusive
quando `pickupDate` é nulo, já que `TimeWindow` exige data). Sete formas cobertas em
`test/pickup-order-pdf.e2e-spec.ts` (faixa, exato, até, a partir de, período — rótulo
`DayPeriod.name` —, cruzando meia-noite, só nota), verificadas contra o PDF real extraído
de volta com `pdf-parse`, mesmo padrão já usado pelo resto do arquivo.

**Migração `20260910000000_add_day_period_and_pickup_time_window` — nota de processo:**
`prisma migrate dev --create-only` recusou rodar (ambiente não-interativo desta sessão —
`Error: Prisma Migrate has detected that the environment is non-interactive`), diferente
da D-038 (onde rodou e aplicou sozinho antes da edição manual). Contornado com `prisma
migrate diff --from-schema <schema antes> --to-schema <schema depois> --script` pra
gerar só o delta real (isolado da migração history, que tinha uma divergência
pré-existente não relacionada — `IbsCbsTaxSituation`, não investigada, fora do escopo
desta unidade), migração escrita à mão a partir desse delta (RLS/índice parcial/
semente/`CHECK` não saem do diff automático, mesmo fluxo de sempre), e aplicada com
`prisma migrate deploy` (idempotente, aplica só o que falta) contra o banco de dev já
sincronizado com as 28 migrações anteriores.

**`prisma migrate reset --force` — executado e verificado.** Na sessão da construção,
foi bloqueado pelo guard de IA do próprio Prisma CLI (`Prisma Migrate detected that it
was invoked by Claude Code`), não pelo classificador do Claude Code como na D-038 — o
Prisma exige confirmação explícita do usuário via
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, e nenhuma instrução anterior conta como
consentimento implícito. **Não foi contornado.** Executado em sessão seguinte, com
consentimento explícito: as 29 migrações aplicaram do zero contra banco vazio, sem erro,
nenhum `CHECK` se comportando diferente aplicado do zero versus aditivamente. Semente
dos nove `DayPeriod` conferida por `psql` (role `mash_owner`, bypassa RLS) imediatamente
após o reset, antes de qualquer teste tocar o banco — nove linhas, `tenantId` nulo,
batendo com o `INSERT` da migração. Números iguais antes e depois do reset: `shared` 65,
backend 315 (23 unitários + 292 e2e).

**Achado de infraestrutura de teste:** `TRUNCATE Tenant CASCADE`, usado pra isolamento
entre arquivos e2e, esvazia a tabela `DayPeriod` **inteira** — inclusive as linhas com
`tenantId IS NULL`, que não referenciam tenant nenhum. É o comportamento correto do
Postgres: `TRUNCATE ... CASCADE` derruba a tabela filha inteira, não só as linhas que
apontam pro truncado. Cada arquivo resemeia via helper com `ON CONFLICT DO NOTHING`,
mesmo padrão de `OrderStatus`/`TripStatus`/`QuoteCostType`. Consequência: **a suíte e2e
nunca exercita a semente da migração**, exercita o helper. Só o reset prova a semente.

28 testes e2e novos (2 `day-period-rls.e2e-spec.ts` + 19
`pickup-order-time-window-check.e2e-spec.ts` + 7 novos em
`pickup-order-pdf.e2e-spec.ts`). Total: `shared` 65, backend 315 (23 unitários + 292
e2e), iguais antes e depois do reset. `npm run build`/`npm run lint` sem erro.

---

## D-046 · Ciclo de vida da cotação: desfecho, validade e revisão

**Status:** Fechada · caminho de criação de revisão/recotação não construído (pendência) ·
prazo de validade opcional no serviço, obrigatoriedade fica na tela (pendência)

**Por quê:** validação de campo com o sócio. A cotação não termina no preço — ela é
aceita, recusada, ou morre de velhice. Os três desfechos existiam na cabeça do operador e
em nenhum lugar do modelo: `QuoteStatus` tinha `OPEN`/`CLOSED`/`LOST` desde a D-018, mas
`LOST` nunca teve significado definido, `markLost()` não tinha chamador nem guarda, e
validade não existia como campo.

### Expirada não é status — é derivada

**A decisão central desta unidade.** Recusa é decisão do cliente; expiração é o relógio.
São perguntas de negócio opostas: muita recusa é preço alto (mexe na margem), muita
expiração é follow-up que não aconteceu (mexe no processo, e é grátis de consertar).
Colapsar as duas cega justamente onde o conserto é barato.

Mas separar não exige duas linhas de domínio:

| Desfecho | Como o sistema sabe |
|---|---|
| Aceita | `statusId` = `ACCEPTED` |
| Recusada | `statusId` = `REJECTED` |
| Expirada | preço fechado, sem desfecho, `validUntil` já passado |

**Alternativa recusada: materializar a expiração como status.** Exigiria alguém rodando
`UPDATE` periódico. O job não roda num fim de semana e na segunda existem cotações mortas
aparecendo como vivas — e alguém aceita uma. Derivado não tem essa janela: a mesma verdade
é lida por filtro, contador e tela, o tempo todo, sem ninguém executar nada. Mesmo critério
da precisão de janela na D-045 (derivada por `precisionOf()`, nunca gravada).

**Alternativa recusada: `REJECTED` novo convivendo com `LOST` sem semântica.** Proposta
pelo agente durante a execução. Duas linhas para desfecho negativo com a distinção "ainda
por definir" é exatamente como se estraga uma tabela de domínio — alguém usa a linha vazia,
atribui um significado próprio, e seis meses depois os dois valores querem dizer coisas
diferentes dependendo de quem clicou. Reaproveitada a linha existente.

### `LOST` → `REJECTED`: o trabalho foi fixar o significado, não criar linha

`LOST`/"Perdida" existia desde a D-018 sem semântica. Passou a significar **"o cliente
respondeu não à proposta"** — o que inclui "fechou com o concorrente", mesmo desfecho do
nosso lado. **Não** inclui "o cliente sumiu": esse é o caso derivado acima.

Com "sumiu" fora, *perdida* descreve mal o que restou. Código e rótulo renomeados para
`REJECTED`/"Recusada", simétricos com `ACCEPTED`/"Aceita" e com os métodos `accept()`/
`reject()`. (Registro de processo: o rótulo "Perdida" foi defendido e depois abandonado
nesta mesma sessão — o argumento a favor dele pressupunha cobrir o cliente que some, o que
deixou de ser verdade quando a expiração virou derivada.)

Definição registrada em comentário no seed, para o próximo leitor não reinventar.

### `validUntil`: guarda a data, não o prazo

`Quote.validUntil` DATE, anulável, **congelada no fechamento** por `GRANT` de coluna — o
mesmo mecanismo que já congela `icmsRateApplied`/`ibsRateApplied`/`cbsRateApplied`/`total`
(D-041/D-043), estendido, não reescrito. `close()` passou a congelar validade nos dois
caminhos, inclusive TABELA (que antes só mudava status).

**Alternativa recusada: guardar o prazo (`3` + `MESES`) em vez da data.** O que vale contra
o cliente é a data. Guardar os dois é redundância que pode divergir, e "válida até 15/09"
é melhor no e-mail que "válida por 3 dias", porque não depende de quando ele leu. O prazo
como o operador escolheu é entrada da função de cálculo e texto de apresentação, não estado.

**DATE e não `timestamptz` — exceção deliberada à D-016**, mesmo tratamento e mesmo motivo
da D-045: é data de calendário acordada com um cliente ("válida até dia 15"), não instante.
Registrada como exceção com motivo, não aplicada em silêncio.

**Aritmética de mês, em `@mash/shared`** (`quote-validity/`, função pura, mesmo padrão de
`time-window` da D-045): quando o dia não existe no mês de destino, **gruda no último dia
do mês** — 31/01 + 1 mês = 28/02, e 29/02 em ano bissexto, testado. Não tem resposta óbvia,
tem resposta escolhida; sem escolher, a biblioteca escolhe sozinha e ninguém revisou.

O predicado de expiração **recebe a data de referência como parâmetro** e nunca lê o
relógio por dentro — senão não existe teste determinístico.

### `previousQuoteId`: um campo, duas leituras derivadas

FK anulável de `Quote` para `Quote`, com `CHECK` de autorreferência (guarda de `NULL`
explícita, D-043). Cobre dois casos que parecem exigir modelagem separada:

- filha criada **antes** do `validUntil` da mãe → **revisão** (desconto na mesma negociação)
- filha criada **depois** → **recotação** (negociação nova, carga podendo ser a mesma)

A distinção sai das datas. Nem campo extra, nem o operador classificando. Motivo de manter
o vínculo mesmo na recotação: quando o cliente volta pela terceira vez na mesma rota, as
três aparecem juntas e dá pra ver se estamos sendo usados como cotação de comparação.

O ganho de negócio do lado da revisão: com as duas lado a lado, dá pra medir **quanto de
margem foi dado para fechar** — multiplicado por milhares de cotações, é a resposta de
"quanto a gente perde negociando", que hoje não existe em lugar nenhum.

Revisão só pode ser linha nova, e isso não é escolha desta decisão: `QuoteCostLine` é
imutável desde a criação e `close()` congela preço e alíquotas (D-041). Cotação fechada não
é editável nem por acidente.

**Mesmo tenant não é garantido por FK composta** — precedente exato de
`CarrierPayment.reversesPaymentId` e `ReceivableEvent.reversesReceivableEventId`.
**Ciclo de profundidade maior que 1 é risco aceito**, não construída detecção.

### O que o banco não protege — declarado, não escondido

Três regras vivem só no serviço, porque `CHECK` não enxerga a data de hoje nem o `code`
por trás de `statusId`:

- não aceitar cotação vencida
- não dar desfecho a cotação sem preço fechado
- não dar desfecho a cotação que já tem desfecho

`assertHasClosedPriceWithoutOutcome()` cobre as duas últimas; só `accept()` checa
vencimento. **Três testes e2e provam deliberadamente que ir direto ao banco com a mesma
credencial `mash_app` do serviço não esbarra em barreira nenhuma nessas três regras** —
documentando o buraco em vez de escondê-lo. É diferente do padrão da D-041, onde o `CHECK`
de caminho exclusivo era testado por fora justamente porque o banco *conseguia* barrar.

### Verificação

Migração 30 (`20260910010000_add_quote_lifecycle`). `shared` 65 → 76, backend 315 → 331
(arquivo novo `quote-lifecycle.e2e-spec.ts`). Build e lint limpos.

**Achado de higiene, terceira ocorrência:** a migração carregou duas linhas que não eram
dela (índice trigram já documentado na D-041 e drift equivalente em `IbsCbsTaxSituation`).
Comentadas na própria migração. Vale uma sessão curta só pra descobrir a origem antes que
vire folclore da base.

## D-047 · O aceite da cotação cria o pedido (caminho CUSTO → `Order`)

**Status:** Fechada · `Order.total` no caminho CUSTO guarda preço unitário e precisa de
revisão contra o faturamento (pendência) · `Trip` continua sem coluna de data (pendência,
bloqueia a tela)

**Por quê:** o `estado.md` registrava uma guarda explícita em `OrderService` recusando o
caminho CUSTO — `Order` só sabia nascer de tabela de preço. Na prática isso significava que
a cotação montada do zero, que é o caso de cliente novo e o caso do e-mail real que motivou
a sessão, não conseguia virar operação. Era o buraco entre o comercial e o operacional.

### O preço é por viagem, e a quantidade nasce na cotação

Evidência de campo, duas fontes independentes:

- **E-mail real** (Águia Translog → Carmelino, set/2026): "R$ 3.000,00 POR CONTAINER" mais
  "R$ 68,00 POR CONTAINER" de adesivos, e "TOTAL FRETE R$ 3.068,00" — que é o total **de um
  contêiner**, não dos quatro. O cliente já mandou os 4 contêineres com código de lacre
  individual junto do pedido de cotação.
- **Planilha real** (operador, 2025): um processo com 5 caminhões, 5 motoristas e CT-e
  7581 a 7585. 229 linhas de continuação no ano inteiro.

`Quote.quantity` (`Int`, `DEFAULT 1`, `CHECK > 0`), congelada no fechamento por `GRANT` de
coluna — mesmo mecanismo de `validUntil` (D-046) e das alíquotas (D-043).

**Nenhuma coluna de agregado.** O valor do pedido é multiplicação, derivada. Alternativa
recusada por ser dado que pode divergir da origem.

### `accept(quoteId, orderInput)` — cliente e filial entram no aceite, não na cotação

`Order.branchId`/`senderId`/`recipientId`/`tomadorId` são `NOT NULL` e `Quote` não guarda
nenhum dos quatro (nem no caminho TABELA — `createFromQuote()` sempre recebeu de fora).
Duas opções foram levantadas durante a execução:

1. `accept()` ganha o mesmo `OrderParties` que já existe — **escolhida**
2. `Quote` passa a guardar os quatro na criação — **recusada**: muda o contrato de
   `create()`/`createCostBased()`, fechados na D-041/D-043, e não foi pedido

A 1 acerta a semântica, não só o escopo. **Quem pede a cotação e quem aparece no CT-e são
coisas diferentes:** no e-mail real, a Águia Translog pede, mas o embarque é da Movecta.
Remetente, destinatário e tomador fiscal só se conhecem quando a operação se monta — o
aceite é o momento certo, não um contorno.

Sem default silencioso para nenhum dos quatro: faltando, falha explícita.

### Tudo numa transação só

`accept()` dá o desfecho e cria `Order` + N `Trip` na **mesma** transação. Aceitar e gerar
pedido não são dois passos com um buraco no meio: ou os dois acontecem, ou nenhum. O núcleo
foi extraído em `createOrderFromQuoteInTransaction(tx, quote, input)` e é reaproveitado por
`createFromQuote()` (que abre a própria transação) e por `accept()` (que usa a do desfecho).
Teste prova: filial inexistente no meio não deixa `Quote` aceita sem pedido, nem `Trip`
órfã.

`UNIQUE` em `Order.quoteId`. Uma cotação produz no máximo um pedido, e isso o banco
**consegue** garantir — diferente das três regras de data da D-046, que vivem só no serviço.

### O pedido nasce incompleto, e isso é deliberado

`Trip.driverId`, `vehicleId` e `destinationAddressId` viraram anuláveis. Motorista, veículo
e destino não existem na cotação e aparecem depois — a planilha do Pedro mostra exatamente
isso: colunas MOTORISTA/CAMINHÃO/CARRETA preenchidas dias após o processo abrir.

O aceite preenche cliente, rota, quantidade e preço. O resto é operação.

**Cirurgia que "remover a guarda" não previa:** `Order.freightRateId`/`rate`/
`minimumFreight`/`additionalPercentage` também eram `NOT NULL` e pertencem só ao caminho
TABELA. Viraram anuláveis, com `CHECK Order_pricing_path_exclusive` espelhando o `CHECK` de
caminho exclusivo da `Quote` (D-041). Sem isso o `INSERT` quebrava de qualquer forma. O
mesmo padrão nos dois lados do modelo.

**`Trip.price` anulável:** nasceu `NOT NULL` e quebrou ~20 arquivos de teste
pré-existentes que criam `Trip` para testar outra coisa (RLS, `sequence`, status,
`PickupOrder`) sem contexto de cotação. Preço só existe em `Trip` nascida de `accept()`.
Consequência aceita: nada no banco garante que uma viagem vinda de cotação tenha preço —
é invariante de serviço, não de schema.

**Guarda nova em `PickupOrderService`:** `Trip` sem motorista/veículo passou a ser estado
possível, então o PDF de ordem de coleta (D-027/D-034) recusa explicitamente em vez de
estourar em propriedade nula.

**Status inicial da `Trip`:** reaproveitado `PENDING_RISK_CLEARANCE`, única linha semeada
que faz sentido para viagem sem motorista atribuído. Nenhum status novo semeado.

### Verificação

Migração 32 (`20260911000000_quote_cost_path_to_order`). Backend 331 → 339 (23 unitários +
316 e2e), `shared` 76 inalterado. Build, lint e `migrate status` limpos.

Testes que provam por fora do serviço: `UNIQUE` de `Order.quoteId` e o `CHECK` de caminho
exclusivo do `Order` — mesmo critério da D-041, onde o banco *consegue* barrar.

### Dois achados que esta unidade não resolveu

**`Order.total` guarda o preço unitário no caminho CUSTO**, e o mesmo número está em
`Trip.price`. Um campo chamado *total* que não é total, duplicado em dois lugares que podem
divergir. A pergunta que decide o conserto: **o faturamento (D-042) lê `Order.total` ou soma
as `Trip`?** Se soma, `Order.total` é redundância no caminho CUSTO e vira `RENAME`
(D-031/D-033). Se lê, a nota de um pedido de 4 contêineres sai com o valor de um.

**`Trip` não tem nenhuma coluna de data.** O bloco central da planilha real é data de
coleta, data de entrega e data de devolução do vazio — de onde saíram as 1.453 formas que
motivaram a D-045. A D-045 construiu o tipo e aplicou só em `PickupOrder`. Sem data na
`Trip`, o sistema não responde "o que tem pra hoje", que é a primeira pergunta do operador
de manhã. É a última lacuna de modelo antes da primeira tela.

### Nota de processo

Uma migração já aplicada foi editada e o checksum em `_prisma_migrations` realinhado à mão.
Funciona **porque existe um banco só**. Em ambiente que já tivesse aplicado a versão
anterior, a coluna continuaria `NOT NULL` e o checksum bateria mentindo. Item para
`docs/deploy-checklist.md`.

## D-048 · Plano do frontend: contrato, sessão, telas e a primeira delas

**Status:** Fechada · margem por dentro vs. por fora pendente de confirmação numérica com o
sócio (única coisa que pode invalidar a primeira tela)

**Por quê:** o backend tem cadastro, comercial, operação, terceiros e financeiro, e zero
tela. Esta decisão fecha as seis perguntas que estavam abertas desde o início da sessão de
planejamento, para que a construção do frontend não invente convenção tela a tela.

Duas das seis são caras de trocar depois — o contrato de API e os tokens de densidade. As
outras quatro se corrigem na primeira tela e estão registradas para não serem redecididas.

### 1 · Contrato: schema Zod em `@mash/shared`, sem geração de código

Backend e frontend importam o **mesmo objeto**: o backend valida no DTO, o frontend valida
no formulário. Uma definição, duas bordas.

**Alternativa recusada: gerar cliente a partir de OpenAPI.** Desenvolvedor solo, as duas
pontas sobem juntas, e a etapa de geração é mais uma coisa para quebrar num deploy que já
tem checklist. **`ts-rest` também recusado** pelo mesmo critério: o schema compartilhado
puro entrega a maior parte do ganho sem dependência nova.

**Regra de fronteira do `shared`:** se o frontend não importa, não é de `shared`. O momento
em que `shared` vira depósito é quando alguém põe lá algo que só o backend usa "porque é
compartilhado".

**Schema de formulário é derivado, não o mesmo.** Na tela o valor chega como `"2.800,00"`
em string com máscara; no contrato é `Decimal`. O schema de contrato mora em `shared` e o
de formulário se deriva dele por `.extend()`/`.transform()`. Forçar um schema só para as
duas coisas dá errado nas duas.

**Validadores brasileiros vão para `shared`:** CNPJ, CPF, placa (Mercosul e antiga), CEP.

**Dinheiro: a D-013 continua valendo sem emenda.** `numeric` do Postgres / `Decimal` do
Prisma, nas três escalas já definidas. A sugestão externa de trafegar centavos em inteiro
foi **recusada** — é exatamente a alternativa que a D-013 descartou, porque frete não opera
em duas casas e centavos inteiros obrigariam a inventar fator de escala por caso. A
armadilha real já está documentada lá: `Decimal` é objeto, `a + b` concatena string
silenciosamente, sempre `.plus()`/`.times()`/`.dividedBy()`.

**O cálculo da cotação sobe para `shared`.** É o caso exemplar da regra "as duas pontas
usam": o frontend chama para o preview ao vivo, o backend chama para o valor oficial.
`QuotePricingCalculator` já é função pura sem banco (D-041) — a mudança é de lugar, não de
natureza. **O backend sempre recalcula e nunca confia no valor que veio do cliente.**

### 2 · Sessão: cookie `httpOnly`, tenant da sessão, sessão opaca

O frontend nunca vê o token. Estado no cliente é "autenticado ou não" mais os dados do
usuário, buscados em `/me` na abertura.

- Cookie `httpOnly`, `Secure`, `SameSite=Lax`. **Sem `Domain=.dominio`** — vazaria sessão
  entre tenants.
- **Sessão opaca em tabela, não JWT no cookie.** Motivo decisivo: derrubar na hora a sessão
  de um operador desligado. Com JWT só expirando, não dá.
- CSRF: validação de `Origin` no backend como mínimo, já que a autenticação é por cookie.
- Login com `argon2` e limite de tentativas.

**O `tenantId` que alimenta o RLS sai da sessão autenticada, nunca do subdomínio.**
Subdomínio pode existir como roteamento ou identidade visual; se existir, o backend confere
se bate com a sessão e rejeita se não bater. Para começar, um host único é mais simples e
igualmente seguro.

**Já resolvido, registrado para não ser reaberto:** a injeção do tenant por `set_config`
dentro da transação (`TenantPrisma.transaction()`, D-012/D-035) já existe, e há teste e2e
provando que o contexto não vaza para a próxima conexão do pool.

### 3 · Inventário de telas — da planilha, não da imaginação

**Comercial:** lista de cotações · cotação nova por custo · cotação nova por tabela ·
detalhe com revisão
**Operação:** lista por processo · detalhe do pedido com N viagens · ordem de coleta
**Cadastro:** partes · endereços · veículos · motoristas · tabelas de preço

**Ordem não fixada além das duas primeiras.** Depois da primeira tela você sabe mais do que
sabe hoje.

**Alternativa recusada: formulário genérico movido a configuração.** Foi minha recomendação
inicial e está errada — resolve os primeiros 70% e depois cada exceção vira flag no motor.
O certo são **componentes genéricos** (campo de moeda, CNPJ com busca automática, endereço
por CEP, layout padrão) montados em código explícito e curto por cadastro. Igualmente
rápido de escrever, sem prender.

**Cadastro não é tela — é modal dentro do fluxo.** O operador está na cotação, digita o
cliente, o cliente não existe, ele cria ali sem sair. O combobox oferece "criar novo", o
CNPJ preenche razão social e endereço, o CEP preenche o endereço. Isso ataca o teste de
aceitação mais do que qualquer atalho: é o que faz a cotação no Mash ser mais rápida que o
e-mail que o operador escreve hoje.

**A lista por processo precisa dar sensação de planilha**, porque é de lá que ele vem:
navegação por teclado, copiar célula, filtro por coluna, visões salvas por usuário. As 25
colunas da planilha real não cabem todas visíveis — perguntar ao operador quais ele olha
todo dia (provavelmente ~8) e quais ele só consulta.

**Pergunta em aberto, registrada:** onde entram CT-e, MDF-e, CIOT e o financeiro na v1. O
provedor está escolhido e validado com emissão real em homologação (D-044), mas a fronteira
do que a v1 promete não está escrita. Fiscal é a parte que mais trava cronograma em TMS
brasileiro.

### 4 · A primeira tela: cotação por custo, dentro da casca

A casca vem junto porque não existe tela sem rota, menu e sessão: sidebar, `Ctrl+K`
(D-022), autenticação, layout.

**O campo protagonista é o preço final, não a margem.** Evidência de campo: o sócio
descreveu que o desconto sai da margem — o operador pensa em preço, e a margem é
consequência. Ele digita 2.800 e vê a margem cair. **Os dois campos são editáveis** (digita
preço e vê margem, ou digita margem e vê preço), mas o preço é o protagonista visual.

**Por que esta e não a lista por processo:** a lista precisa de `Trip` com data, que não
existe (D-047), e o modelo operacional tem três perguntas abertas. A cotação está inteira —
D-041, D-043, D-046, D-047 — e não depende de nenhuma delas. E testa a hipótese que decide
o produto: o operador calcula na hora, milhares de vezes por ano; se a calculadora na tela
não for mais rápida que a calculadora de mão dele, isso precisa aparecer agora.

**Pendência que pode invalidar a fórmula:** custo 2.400, preço 3.000 — margem de 20% (por
dentro, o que está implementado) ou 25% (por fora)? Perguntar pelo número, não pelo
conceito: as duas convenções soam iguais quando alguém explica em voz alta.

*(Correção de registro: em conversa eu citei "13%" para um preço de 2.800 sobre custo 2.400.
O número é 14,3% por dentro. Erro de aritmética meu, apontado em revisão externa.)*

### 5 · Design: tokens desde a primeira tela

Variáveis CSS, nunca valor cravado — já é assento reservado para modo escuro na D-022.
**Densidade é token**, não estilo: altura de linha, espaçamento, fonte de tabela.

**Resolução-alvo com número, não adjetivo: 1366×768 e 1920×1080 com escala de 125%** — as
duas comuns em transportadora. Se a cotação couber em 1366×768 sem rolar, cabe em qualquer
lugar. É o teste de densidade da primeira tela, antes de existirem sessenta com o mesmo erro.

**Números:** `font-variant-numeric: tabular-nums` em toda coluna de valor, alinhamento à
direita, `Intl.NumberFormat('pt-BR')` em todo lugar.

**Atalhos:** registro central, exposto no `Ctrl+K` e nos tooltips. O navegador não deixa
sobrescrever `Ctrl+N`/`Ctrl+T`/`Ctrl+W`; sequências tipo "G depois C" não conflitam. `Enter`
avança entre campos nos formulários de operação.

**`Ctrl+K` busca entidade, não só tela:** número da cotação, CNPJ, placa, nome de motorista.
Exige endpoint de busca; `pg_trgm` já está no projeto (D-038) e o RLS já filtra o resultado.

**Camada de dados — buraco da D-021, agora fechado:** TanStack Query para cache,
invalidação e estados de carregamento, mais roteador tipado. Sem isso cada tela inventa seu
próprio jeito de buscar dado.

### 6 · Endpoints: por ação onde há ciclo de vida, CRUD onde é cadastro

`POST /quotes/:id/accept`, não `PATCH /quotes/:id` com `status` no corpo — um `PATCH`
genérico seria a API contradizendo a imutabilidade por `GRANT` de coluna que existe no banco
inteiro. **Mas cadastro é CRUD de verdade:** `PATCH /vehicles/:id` é legítimo, respeitados
os `GRANT`s. Forçar ação ali é cerimônia sem ganho.

**Idempotência:** duplo clique em "aceitar" não pode aceitar duas vezes. A regra já existe
(D-046), mas a resposta precisa ser `409`, não erro genérico.

**Formato de erro padronizado**, com erros de Zod mapeados por campo, para o formulário
mostrar a mensagem no lugar certo.

**Regra de sequência: o endpoint nasce junto da tela que o consome, nunca antes.** Endpoint
sem tela é código não exercitado que parece pronto.

### Recusado nesta decisão

- **`ts-rest`** — ganho marginal sobre Zod compartilhado puro, dependência a mais
- **Centavos em inteiro** — contraria a D-013, ver acima
- **Coluna `version` para concorrência otimista** — legítimo em geral, mas a operação tem
  duas pessoas; dois operadores editando a mesma cotação ao mesmo tempo ainda não é cenário
  real. Fica como pendência, não como construção.


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
- [x] **Margem por dentro ou por fora? — resolvida, validado com o sócio (D-041, D-048).**
      Por dentro. Confirmado pelo número, não pela definição: custo 2.400 e preço 3.000
      são 20% de margem (600 ÷ 3.000), não 25% de markup (600 ÷ 2.400). O sócio usa
      margem de lucro como indicador, e markup só como métrica de marcação pra definir
      preço. `QuotePricingCalculator` já aplicava `preço ÷ (1 − margem)` por analogia com
      a fórmula do ICMS — a implementação estava certa, faltava a confirmação de campo.
      Nenhuma mudança de código.
- [x] **Janela de tempo em linguagem natural — resolvida, D-045.** Tipo `TimeWindow` em
      `@mash/shared` (commit `bf7f5ea`) e materializado no schema (`DayPeriod` +
      colunas estruturadas em `PickupOrder`, D-045) — deixou de ser pendência.
- [ ] **`Address` não tem horário de funcionamento.** A D-027 já lista isso como
      conteúdo da ordem de coleta, e o dado real usado pra construir `@mash/shared`
      (`shared/src/time-window/`, planilha operacional de 2025) confirma que é uma
      necessidade de verdade — células como "ORDEM DE CHEGADA" (regra de atendimento do
      local, não da carga: primeiro a chegar é atendido primeiro, não tem horário fixo)
      não são janela de tempo nenhuma, são regra do endereço. Não construir agora — só
      registrado, o parser deixa essas formas de propósito em fallback
      (`shared/src/time-window/time-window.parser.ts`, comentário acima de
      `parseTimeWindow`).
- [ ] **Ordem da perna dentro do pedido (`Trip.sequence`, D-037) é registrada hoje na
      coluna de data, por falta de lugar próprio — confirmado em dado real.** Mesma
      planilha operacional de 2025: células como "PRIMEIRA DE QUINTA", "SEGUNDA DE
      SEXTA", "12/03 - TERCEIRO", "PRIMEIRA ENTREGA"/"SEGUNDA ENTREGA" não são horário —
      são o operador dizendo qual perna/entrega é essa dentro do pedido, sem ter onde
      colocar isso, e usando o campo de data como gambiarra. Não muda a D-037 em si, só
      reforça que o campo certo (`Trip.sequence`) já existe e o problema é a UI/processo
      não ter dado ao operador um lugar pra registrar isso desde o início.
- [ ] **Prazo limite da carga não tem campo — nem `Order`, nem `Trip`.** É o dado que
      define o prazo de emissão do CT-e (precisa emitir antes do prazo vencer), e hoje
      não existe em lugar nenhum do modelo.
- [ ] **Faturamento em `Order` com transbordo (D-037): confirmar se fica pronto pra
      faturar com canhoto de TODAS as pernas, ou só da última.** D-042 já decidiu que o
      canhoto ancora em `Trip`, não em `Order` (prova de entrega é evento por perna) —
      mas não decidiu a regra de quando o `Order` inteiro está pronto pra gerar fatura
      quando tem mais de uma `Trip`.
- [ ] **MDF-e e alíquota de IBS/CBS em homologação — perguntas enviadas ao suporte da
      Focus NFe, aguardando resposta.** Ver `docs/RESULTADO.md` (avaliação do provedor,
      D-044): o campo do veículo de tração do MDF-e não foi localizado na documentação
      pública de campos, e a alíquota de IBS-UF que a SEFAZ de homologação valida não é a
      alíquota nacional publicada (0,1%) — testado, rejeitado. Bloqueia terminar a
      avaliação de MDF-e e confirmar por execução real (XML autorizado) se IBS/CBS somam
      ao total do CT-e em 2026.
- [ ] **Alíquotas de ICMS interna por UF — hoje placeholder uniforme (18% em toda UF), a
      calibrar com o contador (D-041, escopo restrito a `icmsOperationType='INTERNA'`
      desde D-043).** `TaxRate.isPlaceholder=true` nessas 27 linhas; `TaxRateService`
      recusa usá-las fora de dev/test, então isso não é risco de vazar pra produção em
      silêncio — mas a calibração real (por UF, de verdade) segue pendente. As duas
      linhas de ICMS interestadual (7%/12%) e IBS/CBS **não** são placeholder — vieram
      da consulta contábil (D-043).
- [ ] **Atualização periódica da tabela `IbsCbsTaxSituation` (CST/`cClassTrib`, D-043).**
      Semeado só o caso padrão (`000`/`000001`); a tabela oficial do Portal Nacional tem
      mais de 160 combinações, atualizada por Nota Técnica — sem mecanismo de
      atualização automática, é acompanhamento manual.
- [ ] **Modelar `valoresPrestacao.componentes` do CT-e (D-041).** `QuoteCostLine` cobre o
      custo; falta o lado do preço decomposto em componentes nomeados com destino fiscal
      — não modelado, só registrado. Vira bloqueante quando a emissão de CT-e (D-006)
      começar a ser construída.
- [ ] **Integração real de storage (Cloudflare R2) pros anexos (D-042).** Bucket/
      credencial não existem ainda — `Attachment.objectKey` é só metadado hoje, sem
      upload nem geração de URL assinada de download implementados. Bloqueia o operador
      de fato anexar um canhoto pelo sistema.
- [ ] **Serviço/controller de `Invoice`/`Boleto`/`ReceivableEvent` (D-042).** Modelo e
      teste existem (mesmo padrão já aceito pra `CarrierHire`/`CarrierPayment`), mas
      ninguém consegue criar fatura/registrar boleto/pagamento fora de teste ainda —
      falta a camada de aplicação.

- [ ] **Prazo de validade obrigatório na criação da cotação (D-046).** `validityTerm` é
      opcional em `close()` e cotação sem prazo nunca expira — o padrão é o inseguro, e é
      silencioso. A regra sobe pra tela, com prazo padrão por tenant.
- [ ] **Caminho de criação de revisão/recotação (D-046).** `Quote.previousQuoteId` existe no
      schema, mas `create()`/`createCostBased()` não aceitam — só dá pra preencher indo
      direto ao banco. Pré-requisito do botão "copiar desta" na tela de cotação.
- [ ] **Cotação por custo não tem vínculo nenhum com cliente (D-047).** Sem isso não há
      lista de cotações nem follow-up de expirada — e follow-up era exatamente a razão de
      separar expirada de recusada na D-046: a métrica existe e fica inútil se não dá pra
      saber pra quem ligar. Antes da tela de cotações, não depois.
- [ ] **`Order.total` vs `Trip.price` no caminho CUSTO (D-047).** Mesmo número em dois
      lugares que podem divergir, e o nome mente (`total` guarda preço unitário). Decide-se
      checando o que o faturamento (D-042) lê: se soma as `Trip`, `Order.total` vira
      `RENAME`; se lê `Order.total`, a nota de um pedido de 4 contêineres sai com o valor
      de um.
- [ ] **`Trip` não tem nenhuma coluna de data (D-047).** Aplicar a D-045 à viagem: janela na
      origem e no destino. Hoje o sistema não responde "o que tem pra hoje". Escopo maior do
      que parece — `Trip` também não tem origem (um destino por viagem, D-018; a origem da
      perna N é o destino da N−1, regra de aplicação), e a janela de coleta teria que descer
      de `PickupOrder` pra `Trip`. Três perguntas de negócio ainda abertas antes de
      construir: transbordo tem quantas janelas por perna (D-037); devolução de vazio como
      `OccurrenceType` (encerramento de ciclo, sem free time — portuário é v1.1, D-039); e
      se o endereço de origem é sempre `Address`, com `Party` quando é terminal/porto
      recorrente e sem vínculo quando é coleta esporádica.
- [ ] **Trilha de auditoria (D-048).** "Quem mudou o preço dessa cotação?" não tem resposta
      hoje. A imutabilidade por `GRANT` de coluna impede a mudança, mas não registra autor,
      tentativa, nem o antes/depois do que é permitido mudar. Não é v1.
- [ ] **Fronteira fiscal da v1 (D-048).** Onde entram CT-e, MDF-e, CIOT e o financeiro.
      Provedor escolhido e validado com emissão real em homologação (D-044), mas o que a v1
      promete não está escrito — e fiscal é a parte que mais trava cronograma em TMS
      brasileiro.
- [ ] **Concorrência otimista (coluna `version`, D-048).** Legítimo em geral, recusado por
      ora: a operação tem duas pessoas, dois operadores editando a mesma cotação ao mesmo
      tempo ainda não é cenário real. Registrado pra não ser redecidido, não pra construir.
### A observar no operacional
- [ ] Coletar **todas as planilhas paralelas**, com dados reais dentro
- [ ] Como a apólice de seguro restringe tipos de carga, e se isso precisa estar no
      sistema
