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

## MDF-e — emissão ainda não autorizada, mas parte dos campos já confirmada por execução

A emissão de MDF-e não chegou a autorizar nesta sessão nem na retomada seguinte (ver
`RESULTADO.md`, teste 7) — o campo do veículo de tração trava a emissão e não foi
localizado em nenhuma das duas páginas de documentação de campos indicadas. Mas a
retomada trouxe achados REAIS (confirmados por resposta da API, não só lidos):

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
- `condutores[]` (motorista, nome+CPF) enviado **solto dentro do grupo do modal
  rodoviário** (não aninhado dentro de nenhum grupo de veículo) é reconhecido e mapeado
  corretamente pela API — confirmado testando (o erro do parser passou a citar
  especificamente os elementos do veículo em vez de reclamar do documento inteiro).
  Isso pode significar que o condutor É informado na própria emissão (não só depois,
  por evento) — mas isso ainda não foi confirmado com uma emissão que chegue a
  autorizar, então fica como "observado, não certo".

**Ainda não resolvido — campo que trava a emissão:** o veículo de tração (placa/tara/
capacidade em KG/tipo de rodado/tipo de carroceria/UF de licenciamento) não foi
reconhecido pela API em NENHUMA das nove estruturas testadas (campo solto, dentro de um
objeto `veiculo_tracao`, dentro de `veiculo`, como array, com/sem `codigo`/`renavam`,
com nomes de campo com e sem sufixo `_veiculo`). A string "veiculo_tracao" não aparece
em nenhuma das duas páginas de documentação de campos indicadas — só no exemplo mínimo
da referência REST geral, que não funciona na prática (testado). **Não sei a
estrutura/nome correto — não é dado inventável, é campo de API que eu não localizei
documentado.**

**Ainda não testado (bloqueado pela emissão não ter sido concluída):**
- Reboques (`Trip` já modela até 2 trailers, mas sem os campos específicos do MDF-e por
  reboque — nome de campo confirmado na documentação: `codigo`/`placa`/`renavam`/
  `tara`/`capacidade_kg`/`cnpj_proprietario`/`rntrc`/`razao_social_proprietario`/
  `inscricao_estadual_proprietario`/`uf_proprietario`/`tipo_proprietario`/
  `tipo_carroceria`/`uf_licenciamento`, dentro de `veiculos_reboque[]`, Coleção[0-3] —
  este SIM foi confirmado, estrutura sem ambiguidade, diferente do veículo de tração)
- Evento de inclusão de condutor pós-emissão, evento de encerramento
- Resultado da autorização: chave, número, série, protocolo, status — mesmo padrão do
  CT-e, ainda não observado pra MDF-e por falta de autorização

**Regra de negócio citada pela documentação da Focus (ainda não verificada por
execução):** não pode haver dois MDF-e abertos (não encerrados) pra mesma placa ao
mesmo tempo. Se o Mash vier a modelar isso, precisa decidir se valida essa regra no
banco (não tem como sem consultar SEFAZ) ou confia que a SEFAZ vai recusar na emissão.

---

## Nota sobre onde isso ancora no modelo atual

Não é decisão desta lista — só um apontamento pra quando a decisão for tomada: o Mash já
tem `Trip` (uma perna da viagem) e `Order` (o pedido). O CT-e da documentação SEFAZ é por
prestação de serviço com início/fim próprios, que hoje mapeiam mais perto de `Trip`
(D-018 já diz "CT-e aceita um só endereço de recebimento", e por isso `Order` vira
várias `Trip` quando há mais de um destino) — mas os valores/tributos do CT-e (ICMS,
IBS/CBS, componentes) não têm hoje nenhum lugar óbvio: `Order` congela preço de venda,
não os tributos que compõem o documento fiscal em si.
