# Campos que o modelo do Mash não tem hoje — CT-e e MDF-e

Não é lista de melhoria de um model existente — **hoje não existe nenhum model `CTe` nem
`MDFe`** no schema do Mash (`backend/prisma/schema.prisma`), só um comentário antecipando
("CTE entra como valor novo do enum `BusinessDocumentType` quando essa unidade for
construída"). Confirmado por leitura direta do schema nesta sessão, não por memória.

Esta lista é o inventário do que a execução real contra a Focus NFe (homologação, sessão
de hoje) confirmou como necessário — só campos que eu vi a SEFAZ exigir de verdade, não
achismo de documentação. Onde algo não foi testado (MDF-e não chegou a autorizar), marco
como "lido, não executado".

**Não construir nada a partir daqui agora — só o inventário, como pedido.**

---

## CT-e — confirmado por execução real (autorização de verdade obtida)

### Identificação
- CFOP, natureza da operação, data de emissão, tipo de documento (normal/complemento/
  anulação/substituto), modal de transporte, tipo de serviço (normal/subcontratação/
  redespacho/redespacho intermediário/multimodal)
- Município/UF de envio (onde o CT-e é emitido)
- **Município/UF de início e fim da PRESTAÇÃO** — diferente de remetente/destinatário,
  é o trecho real transportado. Não existe hoje nem como conceito no `Trip`.

### Partes
- Remetente, destinatário, expedidor, recebedor — cada um com endereço completo
  (logradouro, número, bairro, município+código IBGE, UF, CEP, telefone, e-mail, país)
  **como estavam no momento da emissão** — não é FK pra `Party`/`Address` atuais, é cópia
  imutável (mesmo princípio já usado em `Order`/`Quote`, D-014)
- Indicador de quem retira a mercadoria, indicador da IE do tomador (contribuinte/isento/
  não contribuinte) — nenhum dos dois existe hoje

### Modal rodoviário
- RNTRC (existe em `CarrierProfile.rntrc` hoje, mas **sem validação de formato** — a
  SEFAZ exige exatamente 8 dígitos ou `ISENTO`; o Mash aceita qualquer texto livre)

### Valores e tributos
- Valor total da prestação, valor a receber, componentes do valor (lista nome+valor)
- Grupo ICMS: situação tributária (CST), base de cálculo, alíquota, valor — nenhum
  existe. `Quote`/`Order` têm `rate`/`total` (preço), não modelam ICMS como tributo
  separado
- Grupo IBS/CBS (reforma tributária) — **destaque comum**, campos confirmados por
  autorização real (não é mais leitura de documentação): `ibs_cbs_situacao_tributaria`
  (CST, obrigatório), `ibs_cbs_classificacao_tributaria` (cClassTrib, obrigatório),
  `ibs_cbs_base_calculo`, `ibs_uf_aliquota` + `ibs_uf_valor` (parte estadual),
  `ibs_mun_aliquota` + `ibs_mun_valor` (parte municipal), `ibs_valor_total` (soma
  UF+Mun), `cbs_aliquota` + `cbs_valor`, **mais `valor_total_dfe`** (total do documento
  fiscal — campo separado de `valor_total`/vTPrest, exigido pela SEFAZ assim que o grupo
  IBS/CBS está presente, mesmo a doc marcando como opcional). `TaxRate` (D-041) guarda
  alíquota de referência, mas não o valor calculado por documento nem a base específica
  do CT-e.
  **Cuidado ao implementar:** existe um segundo grupo de campos com nomes muito
  parecidos (`ibs_aliquota_uf`, `ibs_valor_tributo_uf`, `ibs_aliquota_municipio`,
  `ibs_valor_tributo_municipio`, `ibs_cbs_aliquota`, `cbs_valor_tributo` — ordem das
  palavras invertida) que é do grupo de **tributação regular/compra governamental**, não
  do destaque comum — usar o errado passa pela validação de schema mas nunca autoriza
  (confirmado testando os dois).
- **IBS e CBS NÃO somam ao total do documento em 2026 — confirmado por XML autorizado
  real, comparado campo a campo contra um CT-e controle sem o grupo** (teste extra,
  `RESULTADO.md` e `evidencias/teste-extra-ibs-cbs-diferenca.md`). Com prestação de
  R$ 500,00 e IBS+CBS somando R$ 5,00 (0,50 + 4,50) calculados e destacados no XML,
  `vTPrest`, `vRec` e `vTotDFe` (novo totalizador "valor total do documento fiscal", só
  existe/só é exigido quando o grupo IBS/CBS está presente) permaneceram **os três em
  500,00** — idênticos ao CT-e sem o grupo. A SEFAZ inclusive rejeitou uma tentativa de
  enviar `vTotDFe = 505.00` (prestação + tributo), só aceitando `500.00` (só a
  prestação) — a própria validação de negócio confirma a resposta. Reforça, com uma
  segunda fonte de evidência independente da consulta contábil, a decisão já registrada
  em `decisoes.md` D-043 (informativo/destacado, não soma, durante a calibragem 2026).
- **Confirma a modelagem de linhas filhas por tributo (D-041):** o XML autorizado mostra
  `gIBSCBS` com sub-grupos filhos separados por competência — `gIBSUF` (estadual) e
  `gIBSMun` (municipal), cada um com sua própria alíquota+valor — mais `gCBS` (federal)
  como uma terceira linha, só depois somados no totalizador `vIBS`. Não é um campo único
  de alíquota combinada.

### Carga
- Produto predominante, valor total da carga, quantidade (unidade de medida + tipo de
  medida + quantidade, ex. peso bruto em KG) — nada disso existe. `PickupOrder` tem peso/
  volume, mas é da ordem de coleta, não do CT-e, e não tem o mesmo formato

### Documentos vinculados
- Chave de NF-e (44 dígitos) OU "outros documentos" (tipo + descrição livre, pra quando
  não há NF-e real) — nenhum vínculo existe hoje. Confirma a pendência já registrada em
  `decisoes.md` D-041: falta modelar `valoresPrestacao.componentes` E o vínculo de
  documento em si

### Resultado da autorização (o que precisa ser guardado depois de emitir)
- Chave de acesso (44 dígitos), número do CT-e, série, protocolo de autorização (`nProt`),
  data/hora de autorização, status SEFAZ (código + mensagem), XML autorizado (`cteProc`
  completo, com protocolo embutido), link do DACTE

### Eventos (confirmado por execução: cancelamento e carta de correção)
- Cancelamento: justificativa (texto), data do evento, protocolo do evento — nenhum
  campo de evento existe hoje
- Carta de correção: **campo corrigido + valor corrigido + número sequencial da
  correção** — mais importante: **é preciso saber QUAIS campos do CT-e são
  corrigíveis por CC-e e quais não são** (valores/base de cálculo/partes/data de emissão
  NÃO são — confirmado batendo de propósito). Isso é regra de negócio que o modelo
  precisa capturar, não só "texto livre corrigido"
- **Achado de negócio real:** cancelamento é vedado se já existir CC-e no mesmo CT-e —
  se o Mash modelar "pode cancelar" como pergunta simples, essa regra precisa entrar

---

## CT-e — lido em documentação, não confirmado por execução (não autorizei nenhum com isso)

- Campos de modal aéreo/aquaviário/ferroviário/dutoviário/multimodal (só testei rodoviário)
- Tomador como parte separada (só testei tomador=remetente, `toma=0`) — os campos de
  tomador próprio (`nome_tomador`, endereço etc.) existem na documentação mas não
  exercitei essa combinação

---

## MDF-e — autorizado e ciclo completo testado (emissão, condutor, encerramento, eventos)

A emissão de MDF-e autorizou (ver `RESULTADO.md`, teste 7, chave
`MDFe42260962248663000187580010000000011565156768`) depois de resolver sete
bloqueios reais em sequência — dois de estrutura de payload (mensagens de erro XSD lidas
errado nas duas vezes) e cinco de regra de negócio da SEFAZ, nenhum documentado
antecipadamente. Todos os campos abaixo são confirmados por execução real, não leitura
de documentação.

**Confirmado por execução real (mesmo sem chegar a `autorizado`):**
- `registro_nacional_transporte` (RNTRC) é necessário dentro do grupo do modal
  rodoviário — sem ele, a API nem chega a validar o resto do documento (erro
  totalmente genérico, "documento sem elemento raiz"). Confirmado testando com e sem.
- `municipios_descarregamento[]` (código IBGE + nome) é **obrigatório** (Coleção[1-100])
  e nunca foi enviado em nenhuma tentativa anterior — confirmado por leitura direta do
  schema JSON embutido na documentação de campos (não por resposta de erro específica,
  já que o erro genérico mascarava isso).
- Chave de CT-e vinculada vai **aninhada**:
  `municipios_descarregamento[].conhecimentos_transporte[].chave_cte` — confirmado no
  HTML bruto da documentação (uma ferramenta de resumo automático leu errado essa
  mesma página e disse que não era aninhado — divergência registrada em
  `RESULTADO.md`).
- `seguros_carga[]` é **obrigatório** (Coleção[1-1000], mínimo 1 item) pro modal
  rodoviário (Lei 11.442/07) — nunca enviado em nenhuma tentativa. Campos:
  `responsavel_seguro`/`nome_seguradora`/`cnpj_seguradora`/`numero_apolice`/
  `numero_averbacao`.
- `cep_carregamento`/`cep_descarregamento` — obrigatórios quando o MDF-e é de carga
  lotação (nosso caso). Nunca enviados.
- **Estrutura correta do veículo de tração — resolvida na segunda retomada, confirmada
  por schema 100% aceito pela API (não é mais leitura de documentação, é execução
  real).** Não existe nenhum wrapper `veiculo_tracao`: os campos são atributos de nível
  RAIZ do próprio `modal_rodoviario`, com sufixo `_veiculo`, na ordem exata do XSD real
  (`tveiculoTracao`): `codigo_veiculo` (opcional), `placa_veiculo` (obrigatório),
  `renavam_veiculo` (opcional), `tara_veiculo` (obrigatório), `capacidade_kg_veiculo`
  (opcional), `capacidade_m3_veiculo` (opcional), *(grupo proprietário — condicional, só
  obrigatório se algum campo dele for preenchido: `cpf_proprietario_veiculo` OU
  `cnpj_proprietario_veiculo`, `rntrc_proprietario_veiculo`,
  `razao_social_proprietario_veiculo`, `inscricao_estadual_proprietario_veiculo`,
  `uf_proprietario_veiculo`, `tipo_proprietario_veiculo`)*, `condutores` (Coleção[1-10],
  **sem** sufixo, campos `nome`/`cpf` — confirmado que fica na MESMA posição/nível dos
  campos `_veiculo`, não dentro de um wrapper e não solto em outro lugar do
  `modal_rodoviario`), `tipo_rodado_veiculo` (opcional), `tipo_carroceria_veiculo`
  (obrigatório), `uf_licenciamento_veiculo` (obrigatório).
  **O que tinha travado a emissão até aqui não era ausência de documentação — era erro
  de leitura da mensagem de erro do XSD** (posicional: "Expected is (cInt, placa)"
  significa "nesta posição eu esperava um desses dois", não "só esses dois campos
  existem no grupo inteiro").
- `condutores[]` (motorista, nome+CPF) **confirmado, sem sufixo**, na posição descrita
  acima — mesmo campo que a sessão anterior já tinha identificado como reconhecido pela
  API, agora com a posição certa dentro da sequência confirmada.
- `modal` (campo de nível RAIZ do MDF-e, não de `modal_rodoviario` — não confundir com o
  `modal` do CT-e): enum é `{'1','2','3','4'}` (Rodoviário/Aéreo/Aquaviário/Ferroviário),
  **sem zero à esquerda** — diferente da convenção `"01"` usada no `modal` do CT-e.
  Confirmado pela mensagem de erro real da SEFAZ.
- `tipo_carga` (enum 01-12, ex. `"05"` = Carga Geral) e `descricao_produto` — ambos
  **obrigatórios de fato assim que `cep_carregamento`/`cep_descarregamento` estão
  presentes** (MDF-e de carga lotação), mesmo a doc marcando `required: false` — mesmo
  padrão de obrigatoriedade condicional não documentada já visto no CT-e (`valor_total_dfe`).
- **Achado de negócio real, não documentado:** `tipo_transporte` (tpTransp) não pode ser
  informado sem o grupo proprietário do veículo de tração também preenchido —
  `status_sefaz: 745`, *"O tipo de transportador não pode ser informado quando não
  estiver informado proprietário do veículo de tração"*. Se o Mash vier a expor esse
  campo, precisa condicionar os dois juntos.

- **`contratantes` — resolve o bloqueio `578` (tomador obrigatório).** Confirmado por
  execução real: `emitente: "1"` (prestador de serviço de transporte) exige saber quem
  contratou o serviço. Campo `modal_rodoviario.contratantes[]` (Coleção[0-1000],
  `collection_type: InfoContratanteXML`), mesmo nível de `condutores`/`veiculos_reboque`
  — campos `nome` (opcional), `cpf` OU `cnpj` (um dos dois, condicional),
  `id_estrangeiro`/`numero_contrato`/`valor_global_contrato` (opcionais). Preenchido com
  o CNPJ do tomador do CT-e vinculado ao MDF-e → o `578` não voltou.

- **`data_emissao` do MDF-e precisa ficar no passado em relação ao momento do envio.**
  A rejeição `212` ("Data de emissao MDF-e posterior a data de recebimento") sumiu ao
  recuar `data_emissao` em 2 minutos do horário atual (mantendo offset `-03:00`,
  confirmado sem desvio de relógio local contra 2 fontes HTTP independentes). Não é
  desvio de relógio — é a própria SEFAZ exigindo uma folga entre emissão e o
  processamento/recebimento. Se o Mash automatizar emissão de MDF-e, `data_emissao` não
  deve ser `now()` exato no momento do envio.

- **`percursos[]` — resolve o bloqueio `663` (percurso inválido).** Campo de nível RAIZ
  do payload (não dentro de `modal_rodoviario`), confirmado em `MDFeXML.html`:
  `percursos` (Coleção[0-25], `collection_type: InfoPercursoXML`), único atributo
  `uf_percurso` (tag `UFPer`, obrigatório dentro do item). **Regra de negócio real:**
  lista as UFs intermediárias entre `uf_inicio` e `uf_fim`, sem repetir origem/destino,
  na ordem do trajeto — SC→SP não faz fronteira direta, precisa listar `PR`. Se o Mash
  automatizar emissão de MDF-e interestadual, vai precisar calcular ou pedir o trajeto
  de UFs intermediárias, não só origem/destino.

- **`codigo_ncm_produto` — resolve o bloqueio `301` (NCM obrigatório).** Campo confirmado
  em `MDFeXML.html`, ao lado de `descricao_produto`: `String[8]`, tag `NCM`. Marcado
  `required: false` na doc, mas exigido de fato pela SEFAZ pra MDF-e de carga lotação —
  mesmo padrão de obrigatoriedade condicional não documentada já visto em
  `valor_total_dfe` (CT-e) e `tipo_carga`/`descricao_produto` (MDF-e). **Achado de
  ferramenta útil pro Mash:** a Focus expõe uma API acessória de consulta de NCM
  (`GET /v2/ncms`, com filtro por `?descricao=<termo>` ou `?codigo=<prefixo>`) que devolve
  o código real + descrição completa da tabela oficial — se o Mash precisar validar/
  sugerir NCM em qualquer fluxo fiscal, não precisa manter uma tabela própria, pode
  consultar essa rota.

- **`pagamentos[]` — resolve o bloqueio `302` (pagamento obrigatório pra carga
  lotação). O sub-grupo `infBanc` (identificação bancária) é de ESCOLHA, não soma de
  campos — achado real, não estava óbvio na doc.** Campo
  `modal_rodoviario.pagamentos[]` (`collection_type: InfoPagamentoXML`): `nome`/`cpf`/
  `cnpj`/`id_estrangeiro`, `componentes[]` (`tipo`/`valor`/`descricao`,
  `collection_type: ComponentePagamentoXML`), `valor_total_contrato` (obrigatório),
  `forma_pagamento` (obrigatório, `"0"`=à vista/`"1"`=à prazo), `valor_adiantamento`/
  `indicador_adiantamento`/`parcelas[]` (só se à prazo), `tipo_permissao_antecipacao`, e
  o grupo de identificação bancária `infBanc` — que a documentação de campos lista como
  três atributos soltos (`numero_banco`, `numero_agencia`, `cnpj_instituicao_pagamento`)
  mas que a SEFAZ só aceita **UMA das três alternativas por vez**: banco+agência
  (`numero_banco`+`numero_agencia`) OU instituição de pagamento eletrônico
  (`cnpj_instituicao_pagamento`) OU chave `pix`. Enviar mais de uma alternativa junto
  (como fiz na primeira tentativa) quebra o XSD (`Element 'CNPJIPEF': This element is
  not expected`) — não é erro de ordem, é erro de escolha múltipla onde só uma é
  permitida. Com só `numero_banco`+`numero_agencia` → autorizou.
- **Achado de negócio real, não documentado:** `data_emissao` do MDF-e precisa ficar no
  passado em relação ao momento do envio (não `now()` exato) — a rejeição `212` ("Data
  de emissao MDF-e posterior a data de recebimento") sumiu recuando 2 minutos. Não é
  desvio de relógio (checado contra 2 fontes HTTP independentes, sem desvio).
- **`percursos[]`** (nível RAIZ do payload, não `modal_rodoviario`) — lista as UFs
  intermediárias entre `uf_inicio` e `uf_fim`, sem repetir origem/destino, na ordem do
  trajeto. SC→SP exige listar PR (não fazem fronteira direta). Sem isso:
  `status_sefaz: 663`, *"Percurso informado inválido"*.
- **`codigo_ncm_produto`** (ao lado de `descricao_produto`, `String[8]`) — obrigatório
  de fato pra MDF-e de carga lotação, mesmo marcado `required: false` na doc. **Achado
  de ferramenta útil pro Mash:** existe uma API acessória de consulta de NCM
  (`GET /v2/ncms`, filtro `?descricao=<termo>` ou `?codigo=<prefixo>`) que devolve o
  código real da tabela oficial — se o Mash precisar validar/sugerir NCM em qualquer
  fluxo fiscal, não precisa manter tabela própria.

### Eventos e ciclo de vida pós-autorização — todos confirmados por execução real

- **Inclusão de condutor (`POST /v2/mdfe/{ref}/inclusao_condutor`):** corpo **flat**
  (`cpf`+`nome`, ambos obrigatórios) — diferente do campo `condutores[]` (array) usado na
  emissão. `status_sefaz: 135`, evento vinculado ao MDF-e, XML do evento gerado.
- **Encerramento (`POST /v2/mdfe/{ref}/encerrar`):** campos `data` (`YYYY-MM-DD`),
  `nome_municipio`, `sigla_uf` (todos obrigatórios) — sem `codigo_municipio`.
  `status_sefaz: 135`.
- **Regra de negócio confirmada por execução (antes só lida em doc): não pode haver dois
  MDF-e abertos (não encerrados) pra mesma placa ao mesmo tempo.** Emiti um segundo
  MDF-e mesma placa, deixei aberto, tentei um terceiro → `status_sefaz: 611`,
  *"Rejeição: Existe MDF-e não encerrado para esta placa, tipo de emitente e UF
  descarregamento"* — a mensagem cita a CHAVE e o PROTOCOLO do MDF-e ainda aberto, não é
  texto genérico. **Se o Mash vier a emitir MDF-e, precisa rastrear "placa com MDF-e
  aberto" antes de tentar emitir outro** — a SEFAZ recusa, mas só na hora da emissão, não
  antes (não tem como consultar preventivamente, ver item abaixo).
- **Não existe rota de consulta de MDF-e não encerrados por CNPJ** — reconfirmado com
  testes reais adicionais contra a API (não só contra a documentação):
  `GET /v2/mdfe?cnpj_emitente=...` → `404`; `GET /v2/mdfe/nao_encerrados?...` → tratado
  como busca por referência (`referencia="nao_encerrados"`), não como rota especial;
  `GET /v2/mdfe?placa=...` → `404 endpoint não encontrado`. A única rota de consulta é
  `GET /v2/mdfe/{referencia}` (documento único, sem filtro/listagem). **Se o Mash
  precisar saber "quais placas têm MDF-e aberto agora", precisa manter esse estado
  internamente** — a API não oferece consulta pra isso.

**Resultado da autorização** (mesmo padrão do CT-e, agora confirmado por execução real
pro MDF-e também): chave de acesso (44 dígitos), número, série, `status_sefaz` (código +
mensagem), `caminho_xml` (XML completo com protocolo embutido), `caminho_damdfe` (PDF).

**Ainda não testado:**
- Reboques (`Trip` já modela até 2 trailers, mas sem os campos específicos do MDF-e por
  reboque — nome de campo confirmado na documentação: `codigo`/`placa`/`renavam`/
  `tara`/`capacidade_kg`/`cnpj_proprietario`/`rntrc`/`razao_social_proprietario`/
  `inscricao_estadual_proprietario`/`uf_proprietario`/`tipo_proprietario`/
  `tipo_carroceria`/`uf_licenciamento`, dentro de `veiculos_reboque[]`, Coleção[0-3])
- Cancelamento de MDF-e (`doc.focusnfe.com.br/reference/cancelar_mdfe`, lido em sessão
  anterior, nunca executado)
- Modais aéreo/aquaviário/ferroviário/dutoviário/multimodal (só testei rodoviário)

---

## Nota sobre onde isso ancora no modelo atual

Não é decisão desta lista — só um apontamento pra quando a decisão for tomada: o Mash já
tem `Trip` (uma perna da viagem) e `Order` (o pedido). O CT-e da documentação SEFAZ é por
prestação de serviço com início/fim próprios, que hoje mapeiam mais perto de `Trip`
(D-018 já diz "CT-e aceita um só endereço de recebimento", e por isso `Order` vira
várias `Trip` quando há mais de um destino) — mas os valores/tributos do CT-e (ICMS,
IBS/CBS, componentes) não têm hoje nenhum lugar óbvio: `Order` congela preço de venda,
não os tributos que compõem o documento fiscal em si.
