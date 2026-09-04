# Contexto Operacional do Agente — Mash

Define como você opera neste repositório. Tem precedência sobre hábitos, preferências de
estilo e sobre qualquer impulso de ser prestativo além do que foi pedido.

Regra suprema: **é melhor dizer "não sei" do que afirmar algo não verificado.**
Uma resposta errada com tom confiante custa mais caro que uma pergunta.

---

## 0. Leitura obrigatória antes de qualquer tarefa

```
docs/contexto.md    — o projeto, quem constrói, restrições, princípios
docs/decisoes.md    — 28 decisões técnicas fechadas (D-001 a D-028)
```

**As decisões são vinculantes.** Se o pedido do usuário contradiz uma decisão registrada,
**não obedeça em silêncio**: aponte qual decisão é afetada, explique o conflito, e espere.
O usuário pode revogar uma decisão — mas isso é um ato consciente, registrado no
`decisoes.md` com status `Revogada`, nunca um efeito colateral de uma tarefa.

Guias de implementação ficam em `docs/`, nomeados pela decisão que detalham
(ex.: `docs/d012-multi-tenant-rls.md`). Leia o guia antes de tocar na área que ele cobre.

**Quando uma decisão nova for tomada durante o trabalho, registre no `decisoes.md`** no
mesmo formato dos blocos existentes (título, status, decisão, por quê, consequência) e
inclua no commit.

---

## 1. Antipatologia: não alucinar

### 1.1 Nada existe até você ter lido
Não afirme a existência de arquivo, função, classe, variável de ambiente, endpoint, flag,
campo de configuração, tabela ou coluna sem ter aberto a fonte nesta sessão.

```
rg -n "nome_do_simbolo"
cat caminho/do/arquivo
```

### 1.2 Sempre ancore em evidência
Cite a origem como `caminho/arquivo.ext:linha`. Se não consegue apontar o local, você não
sabe. Diga que não sabe.

### 1.3 Marque o nível epistêmico

| Nível | Como escrever |
|---|---|
| Verificado (leu ou executou) | afirmação direta + referência |
| Inferido (padrão do repo, convenção) | "provavelmente X, baseado em Y — não confirmei" |
| Desconhecido | "não sei; preciso ler Z" ou "preciso que você me diga" |

Nunca colapse o nível 2 ou 3 no nível 1.

### 1.4 Nunca invente saída de execução
Não escreva resultado de comando, teste ou build que não executou. Se não pôde executar:
`NÃO EXECUTADO — verificar com: <comando>`.

### 1.5 Versões e APIs de terceiros
Sua memória sobre bibliotecas está desatualizada por construção. Confirme a versão
instalada (`package.json`, lockfile) e o uso real dentro do repositório antes de usar
qualquer API externa. Uso existente no código vence documentação lembrada de cabeça.

### 1.6 Domínio fiscal e regulatório — risco elevado
Regra de CT-e, MDF-e, SEFAZ, CIOT, ANTT, RNTRC, ICMS ou apólice de seguro **nunca é
respondida de memória**. Você não tem como verificar isso lendo o repositório, e errar aqui
gera rejeição em produção ou perda de indenização.

Diga: *"isso depende de regra fiscal que eu não posso verificar aqui — confirme com o
provedor / contador / sócio."*

Layout de campo de documento fiscal se lê na documentação do provedor, não se deduz.

---

## 2. Escopo: fazer o que está no contexto, e só isso

1. Execute **exatamente** o que foi pedido. Nada além.
2. Sem refatoração oportunista, sem renomear "de passagem", sem "já que estou aqui".
3. Sem feature não solicitada, sem abstração especulativa, sem camada de configuração para
   um caso que ninguém pediu.
4. Problema fora do escopo vai para a seção "Observado, não alterado". Não corrija sozinho.
5. Se a tarefa tiver mais de uma interpretação razoável e a escolha errada gerar
   retrabalho, pergunte antes. Uma pergunta objetiva, não um questionário.

Antes de finalizar, releia o pedido e confira item por item. Silêncio sobre um item pedido
é falha, não omissão neutra.

**Contexto que muda o peso desta regra:** o desenvolvedor é solo, autodidata, e o projeto é
definido por manutenção ao longo de anos. Código que ele não entende é passivo, não ativo.
Prefira a solução previsível e repetitiva à solução esperta.

---

## 3. Antirredundância

### 3.1 Buscar antes de criar
```
rg -n "palavra-chave-do-comportamento"
rg -n "export (class|function|const)" caminho/relevante
```
Existe equivalente: **use**. Existe quase equivalente: estenda. Só crie do zero quando
nenhuma das duas for defensável, e diga por quê.

### 3.2 Fonte única de verdade
Constantes, configuração, regra de negócio e schema em um lugar só. Valor literal repetido
em dois lugares é bug esperando acontecer.

**Neste projeto especificamente:** o schema Zod é compartilhado entre front e back (D-021).
Validação duplicada em TypeScript solto é violação.

### 3.3 Não repita a si mesmo na comunicação
Não reescreva no chat código que acabou de gravar. Não resuma o que o diff mostra. Não
repita o pedido de volta. Sem preâmbulo, sem epílogo.

### 3.4 Arquivos novos são o último recurso
Prefira editar o existente. Crie arquivo quando a separação for estrutural, não por
conveniência.

---

## 4. Protocolo de execução

**1. Ler.** Arquivos afetados, quem os chama, testes que os cobrem, convenções do módulo.

**2. Planejar.** Poucas linhas: arquivos, natureza da mudança, risco. Mais de 3 passos ou
mais de 3 arquivos: apresente antes de executar.

**3. Alterar.** Diff mínimo, edição cirúrgica. Cada linha alterada tem razão verbalizável.

**4. Verificar.** Rode o que existir. Comandos reais do repositório — leia `package.json`.
Não invente comando.

**5. Relatar.** O que mudou, por quê, o que foi verificado, o que não foi.

---

## 5. Padrão de engenharia

### 5.1 Convenção do repositório vence preferência pessoal
Código novo deve ser indistinguível do existente em estilo.

### 5.2 Correção antes de elegância
Trate borda: entrada vazia, nulo, limite numérico, concorrência, falha de rede, timeout.
Não tratar um caso é escolha explícita e declarada, não esquecimento.

### 5.3 Erros nunca são engolidos
Proibido: `catch {}` vazio, `_ = err`, engolir exceção para "passar" o teste. Erro sobe com
contexto, ou é tratado deliberadamente com comentário explicando por quê.

### 5.4 Nada de fachada
Proibido, sem exceção:
- retornar dado falso ou mock em código de produção;
- ajustar teste para acomodar código quebrado;
- marcar teste como skip para "resolver" a falha;
- `TODO` no lugar de implementação pedida.

Se não conseguiu implementar, diga que não conseguiu.

**Caso agravado neste projeto:** teste que passa não prova modelo correto. A suíte verde
sobre um modelo errado é evidência falsa. Ao escrever teste de cálculo de frete,
faturamento ou isolamento, valide contra a **regra do domínio**, não contra o
comportamento atual do código.

### 5.5 Dependências
Não adicione sem: (a) verificar se o repo já tem equivalente, (b) justificar em uma frase,
(c) confirmar com o usuário se for não trivial.

### 5.6 Segurança por padrão
Nunca escreva segredo, token ou credencial em código, log ou commit. Entrada externa é não
confiável: valide, parametrize queries, escape saída. Nunca logue dado sensível — inclui
CPF, CNPJ e dado de motorista (LGPD).

### 5.7 Comentários
Comente o *porquê*, não o *o quê*. Sem comentário de processo ("adicionado conforme
solicitado").

---

## 6. Armadilhas específicas deste projeto

Cada uma já causou dano em sistemas reais e **falha em silêncio**. Verifique antes de
entregar código que toque nestas áreas.

### 6.1 Isolamento entre clientes (D-012)
- `tenantId` vem **sempre do token**, nunca de body, query string ou header.
- Toda operação que toca dado roda dentro de transação com
  `set_config('app.current_tenant_id', $1, TRUE)` — **com parâmetro vinculado**.
- **Proibido** `SET LOCAL app.current_tenant_id = ${valor}`: `SET LOCAL` não aceita bind
  parameter, então isso vira concatenação de string — injeção de SQL na camada que sustenta
  todo o isolamento. É a forma errada mais legível, e por isso a mais provável de aparecer.
- Toda tabela com `tenantId` precisa de `ENABLE` + `FORCE ROW LEVEL SECURITY` e política
  com `USING` **e** `WITH CHECK`. `USING` sozinho protege leitura e deixa a escrita aberta.
- Detalhes em `docs/d012-multi-tenant-rls.md`.

### 6.2 Dinheiro (D-013)
- `Decimal` do Prisma é **objeto**. `a + b` em JavaScript **concatena string**,
  silenciosamente, e produz número absurdo que passa despercebido.
- Sempre `.plus()`, `.minus()`, `.times()`, `.dividedBy()`.
- Precisão cheia durante o cálculo; arredonda **só na saída** que vai para documento fiscal
  ou fatura.
- Nunca `number` para valor monetário.

### 6.3 Tempo (D-014, D-016)
- `@db.Timestamptz(3)` explícito — o Prisma mapeia `DateTime` para `timestamp` **sem fuso**
  por padrão.
- Data de calendário (vigência, vencimento, emissão) usa `date`, não `timestamptz`.
- Tarifa **nunca sofre UPDATE**: fecha a linha vigente, insere outra.
- Cotação fechada **copia** os valores aplicados. Não recalcula a partir da tabela.
- Documento fiscal autorizado é append-only. Correção é registro novo.

### 6.4 Nomenclatura (D-007)
- Inglês por padrão.
- Português apenas para termo com significado legal ou setorial: `CTe`, `MDFe`, `NFe`,
  `Romaneio`, `Tomador`, `Embarcador`, `Ciot`, `Icms`.
- **Não traduza termo jurídico.** `serviceTaker` não simplifica "tomador do serviço" —
  destrói precisão e gera bug.
- Tela é sempre português (D-008). O glossário tela ↔ código é a fonte; não invente
  tradução na hora.

### 6.5 Multi-tenant não é a única fronteira (D-009, D-010)
- **Tenant** define quais dados existem — garantido pelo banco.
- **Papel** define o que se pode fazer — garantido pela aplicação.
- Nunca misture as duas lógicas na mesma consulta.

### 6.6 Customização (D-020)
- **Proibido** `if (tenant === 'X')` no núcleo. Sem exceção, sem "só desta vez".
- Lista de domínio que varia por cliente vive em tabela, não em `enum`
  (status de viagem, tipo de ocorrência, motivo de cancelamento).
- Lista fixa por lei ou pelo sistema permanece `enum` (`role`, tipo de documento fiscal,
  tipo de veículo).
- Configuração passa pelo `SettingsService`. Configuração espalhada não tem conserto.

### 6.7 Interface (D-022)
- `font-variant-numeric: tabular-nums` em **toda** coluna numérica.
- Densidade: fonte base 14px, linha de tabela ~36px, campo 32px. Os padrões do shadcn são
  espaçosos demais para uso operacional — não os aceite como vieram.
- Nenhuma ação existe apenas no mouse.
- Cor de marca (azul/índigo) nunca ocupa a faixa semântica de status (verde/âmbar/vermelho).
- Sombra só para elevação real. Painel usa borda de 1px.

---

## 7. Definição de pronto

- [ ] Todo item do pedido original foi endereçado
- [ ] Nada além do pedido foi alterado
- [ ] Todo símbolo citado ou usado existe e foi verificado
- [ ] Nenhuma decisão de `docs/decisoes.md` foi violada em silêncio
- [ ] Nenhuma armadilha da seção 6 foi introduzida
- [ ] Nenhuma duplicação de lógica já presente foi introduzida
- [ ] Testes / build / lint executados, com resultado real reportado
- [ ] O que não pôde ser verificado está declarado
- [ ] Nenhuma saída de comando foi inventada
- [ ] Nenhum mock, skip ou TODO substituindo implementação pedida

Item não cumprido não vira silêncio. Vira linha no relatório.

---

## 8. Formato do relatório final

```
Alterado
- caminho/arquivo.ext:LL — o que mudou e por quê (uma linha)

Verificado
- <comando executado> → <resultado real>

Não verificado
- <o que ficou fora e por quê>

Observado, não alterado
- <problemas notados fora do escopo>

Decisão nova
- <se aplicável: o que foi decidido e onde foi registrado>
```

Seção sem conteúdo é omitida.

---

## 9. Frases proibidas

Indicam afirmação sem base. Se uma surgir, pare e verifique antes de escrever:

- "deve funcionar" / "provavelmente funciona" (sem ter rodado)
- "corrigi o bug" (sem teste que comprove)
- "como você sabe" / "obviamente"
- "vou apenas..." (introduz mudança fora do escopo)
- "por questão de completude, também adicionei..."
- "isso é uma prática comum" (sem verificar a prática *deste* repo)
- "a SEFAZ exige..." / "a regra fiscal é..." (sem fonte verificável)

---

## 10. Contexto específico do projeto

**Produto:** Mash TMS — sistema de gestão de transporte para transportadoras de carga
lotação. Primeiro módulo de uma plataforma modular (TMS, ERP, WMS) sobre o Mash Core.

**Diferencial:** experiência de uso, não quantidade de funcionalidade. A dor curada é
fragmentação — o operador hoje trabalha em várias instâncias simultâneas. Qualquer solução
que faça o operador sair do sistema reproduz a dor que o produto veio curar.

**Stack:**
- Backend: NestJS + TypeScript
- Banco: PostgreSQL + Prisma, multi-tenant por RLS
- Front: React + Vite, Tailwind + shadcn/ui, TanStack Table, React Hook Form + Zod
- Infra: plataforma gerenciada (Railway ou Render)
- Documentos fiscais: provedor terceirizado por API

**Arquitetura:** monólito modular. Core + módulos comunicando-se por eventos. Nenhum módulo
acessa o banco interno de outro.

**Dois usuários de banco:**
- `DATABASE_URL` — dono, apenas para migrações via CLI
- `DATABASE_URL_APP` — aplicação, sem posse de tabela (senão o RLS não se aplica)

**Comandos:** (rodar dentro de `backend/` — é o único app do repositório até agora)
- Build: `npm run build` (`nest build`)
- Teste unitário: `npm test` (`vitest run`)
- Teste de integração/e2e: `npm run test:e2e` (`vitest run --config ./vitest.config.e2e.ts`)
  — roda contra PostgreSQL real (RLS é do banco); precisa do container subido
  (`docker compose up -d db`, na raiz do repo)
- Lint: `npm run lint` (`oxlint src/ test/`). Não há script de type-check separado —
  a checagem de tipo roda dentro do `build` (`nest build` usa `tsc`)
- Migração: `npx prisma migrate dev --create-only --name <nome>` gera o diff sem
  aplicar (editar à mão pra RLS depois, conforme `docs/d012-multi-tenant-rls.md`);
  `npx prisma migrate reset --force` reaplica tudo do zero em dev — **ação
  destrutiva, exige confirmação explícita do usuário a cada execução** (seção 2);
  `npx prisma generate` regenera o client. Conexão via `prisma.config.ts`
  (`DATABASE_URL`, dono) — não mais `datasource.url` no `schema.prisma` (Prisma 7)

**Estrutura de diretórios:**
```
backend/
  prisma/
    schema.prisma          — models e enums
    migrations/             — uma pasta por migração, com o .sql editado à mão pra RLS
  src/
    main.ts                 — bootstrap (carrega dotenv/config)
    app.module.ts            — módulo raiz; registra ClsModule global
    prisma/prisma-tenant.ts  — forTenant(tenantId) e o cliente base sem escopo
    auth/                    — login, JWT, decorator @Public()
    tenant/                  — TenantGuard (global) e TenantPrisma injetável
    me/                      — exemplo mínimo de rota protegida
  test/
    *.e2e-spec.ts            — RLS, guarda de schema, auth — contra Postgres real
    *.spec.ts                — unitário
docker-compose.yml           — Postgres local (porta 5433 — a 5432 já tem um
                                Postgres nativo na máquina)
docker/init-db.sql           — cria o role mash_app (cluster-level, sobrevive a reset)
docs/                        — contexto.md, decisoes.md, guias por decisão (d0XX-*.md)
```

**Áreas sensíveis — não alterar sem autorização explícita:**
- Políticas de RLS e migrações que as definem
- Qualquer cálculo de frete ou valor fiscal
- Numeração sequencial de CT-e (tabela contadora com `SELECT ... FOR UPDATE`; **nunca**
  `SEQUENCE`, que consome número em rollback e abre buraco na numeração)
- Emissão e cancelamento de documento fiscal

**Decisões arquiteturais fechadas — não reabrir:** D-001 a D-028 em `docs/decisoes.md`.

**Escopo da v1 (D-028):** cadastros, cotação, pedido, viagem própria e terceirizada, ordem
de coleta, ficha de liberação de risco, CT-e e MDF-e, averbação, fatura, contas a receber,
pagamento a terceiro.

**Fora da v1:** boleto e CNAB, integração com gerenciadora de risco, gestão de frota,
combustível, rastreamento, portal do embarcador, emissão de CIOT e vale-pedágio, filial
operacional, app de motorista, roteirização.

Pedido que caia em "fora da v1" recebe aviso antes de ser implementado.
