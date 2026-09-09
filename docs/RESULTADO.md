# Avaliação Focus NFe — Resultado

Ambiente: `https://homologacao.focusnfe.com.br`, fixo no código (`lib.sh`), nunca
configurável. Token de homologação lido de `FOCUS_TOKEN` (variável de ambiente). Toda
requisição/resposta crua está em `./evidencias/*.txt` — este documento aponta pra cada
arquivo, não repete o conteúdo.

**Sobre o processo:** a sessão começou bloqueada — a empresa não estava habilitada pra
CT-e NEM MDF-e (`empresa_nao_habilitada`), mesmo com certificado A1 vinculado. Isso foi
corrigido do lado do usuário entre as duas partes desta avaliação. A partir daí, o CT-e
exigiu 12 iterações de payload até autorizar de verdade — cada erro real da SEFAZ/Focus
guiou a próxima tentativa, sem inventar campo (seção "Antes do CT-e autorizar" abaixo
documenta a cadeia completa, porque ela É parte da evidência: mostra exatamente quantos
campos a documentação pública não deixa claros de antemão).

---

## Antes do CT-e autorizar — a cadeia de correção real

Onze respostas de erro reais, em sequência, cada uma corrigindo exatamente o que a
mensagem anterior apontou (evidência: `evidencias/01-emissao-normal-envio-v2.txt` até
`-v12.txt`, mais `00-verificacao-habilitacao-cte.txt`):

| # | Erro | Campo que faltava/estava errado |
|---|---|---|
| 1 | `campos_invalidos_modal` — RNTRC não bate no padrão `[0-9]{8}\|ISENTO` | `EMITENTE_RNTRC` real tem 9 dígitos (`059167333`); a SEFAZ exige 8. **Divergência real de dado, não de documentação** — ver seção final |
| 2 | XSD: `UFEnv` esperado | faltava `uf_envio` |
| 3 | XSD: `infCarga` esperado | faltava `produto_predominante` + `valor_total_carga` |
| 4 | XSD: `tpServ` esperado antes de `toma3` | faltava `tipo_servico` |
| 5 | XSD: `infQ` esperado dentro de `infCarga` | faltava array `quantidades` (`codigo_unidade_medida`/`tipo_medida`/`quantidade`) |
| 6 | XSD: `cMunIni` esperado | faltava `codigo_municipio_inicio`/`municipio_inicio`/`uf_inicio` |
| 7 | XSD: `retira` esperado | faltava `retirar_mercadoria` |
| 8 | XSD: `indIEToma`/`xDetRetira` esperado | faltava `indicador_inscricao_estadual_tomador` |
| 9 | SEFAZ 693: "Grupo Documentos Transportados deve ser informado" | faltava `outros_documentos` (não tenho NF-e real vinculada — usei tipo 99, texto livre) |
| 10 | SEFAZ 316: "Alíquota do IBS da UF inválida" | primeira tentativa de IBS/CBS, alíquota chutada |
| 11 | XSD: `pAliqIBSUF` esperado antes de `pAliqCBS`, depois `vTribIBSUF` esperado | nomes de campo do grupo IBS/CBS levaram 3 buscas de documentação pra confirmar (`ibs_aliquota_uf`, `ibs_valor_tributo_uf`, `ibs_aliquota_municipio`, `ibs_valor_tributo_municipio`, `ibs_cbs_aliquota` pro CBS) |
| 12 | SEFAZ 316 de novo, mesmo com schema 100% válido | alíquota do IBS-UF que usei (0,05%, chute) não bate com a tabela real da SEFAZ — **não sei a alíquota real, não vou adivinhar mais** (seção 1.6) |

**Nível epistêmico dos nomes de campo de IBS/CBS:** confirmados por execução real (a
SEFAZ aceitou o schema inteiro na tentativa 12), não só por leitura de documentação — a
documentação pública (`campos.focusnfe.com.br`) deu respostas inconsistentes entre buscas
diferentes pro mesmo campo (`ibs_uf_aliquota` vs `ibs_aliquota_uf`, por exemplo), e só a
resposta real da API resolveu qual estava certo.

---

## Teste 1 — Emissão normal

**Com IBS/CBS preenchidos:** schema 100% aceito pela SEFAZ (nenhum erro de campo),
rejeitado por regra de negócio: alíquota do IBS-UF que usei não é a real.
`status_sefaz: 316`, `"Rejeição: Alíquota do IBS da UF inválida"`. Evidência:
`evidencias/01-emissao-normal-envio-v12.txt` + `01-emissao-normal-poll-v3-1.txt`.

**Controle, sem nenhum campo de IBS/CBS:** autorizado. `status_sefaz: 100`,
`chave: CTe42260962248663000187570010000000011405073038`. Evidência:
`evidencias/01-controle-sem-ibscbs-envio.txt` + `01-controle-poll-1.txt`.

**Quanto tempo:** autorização ou rejeição sempre saiu dentro do primeiro polling de 3s
(medido em 4 emissões distintas: 5-6s do envio até status final). Rápido, consistente.

**Assíncrono:** confirmado — toda emissão devolve `202`/`processando_autorizacao`
primeiro, nunca autoriza/rejeita na mesma resposta do `POST`.

**Onde divergiu do esperado:** eu esperava (pelo `plano.md` da sessão anterior) que o
payload documentado em `doc.focusnfe.com.br/reference/emitir_cte` fosse suficiente pra
pelo menos chegar na SEFAZ. Não foi — precisei de 8 campos adicionais que só a
documentação de campos (`campos.focusnfe.com.br`) tinha, e mesmo essa exigiu buscas
repetidas pra achar nomes certos no grupo IBS/CBS.

---

## Teste 2 — Envio duplicado

**Mesmo ref, já autorizado:** `409 cte_ja_autorizado` — *"Já existe um CT-e autorizado
utilizando esta referência."* Nenhum CT-e duplicado. Evidência:
`evidencias/02-envio-duplicado-ja-autorizado.txt`.

**Mesmo ref, duas chamadas disparadas em paralelo (condição de corrida real, não
sequencial):** uma recebeu `202` (aceita), a outra `422 pending_operation` —
*"Uma solicitação de processamento para essa nota fiscal já está sendo atendida"* — um
código de erro DIFERENTE do caso "já autorizado", mas o mesmo resultado de fundo: nunca
duplica. Confirmado por consulta final: só uma autorização saiu do ref (`numero: 3`).
Evidência: `evidencias/02-race-chamada-A.txt`, `-B.txt`, `02-race-resultado-final.txt`.

**Esperado vs ocorrido:** esperava um único código de erro pros dois casos; são dois
(`pending_operation` durante o processamento, `cte_ja_autorizado` depois de pronto) —
uma aplicação real precisa tratar os dois como "não duplicar", não só um.

---

## Teste 3 — Rejeição e reenvio

**Rejeição proposital:** data de emissão 30 dias no passado. `status_sefaz: 228`,
`"Rejeicao: Data de Emissao muito atrasada"` — mensagem em português, cru da SEFAZ (sem
sinal de tradução/paráfrase da Focus). `numero: 20` e uma `chave` foram atribuídos mesmo
sem autorizar. Evidência: `evidencias/03b-rejeicao-proposital-resultado.txt`.

**Reenvio com o MESMO ref, corrigindo só a data:** aceito com `202` (diferente do caso
"já autorizado", que dá `409` — rejeição não bloqueia reuso do ref). Autorizou com
`numero: 20` — **o número NÃO foi consumido pela rejeição.** Evidência:
`evidencias/03c-reenvio-corrigido-mesmo-ref.txt`, `03d-reenvio-corrigido-resultado.txt`.

**Contraste que prova a regra:** no teste 5 (abaixo), reenviar um número que **já tinha
sido autorizado** (não rejeitado) deu rejeição de duplicidade pela SEFAZ. A diferença é
exatamente "autorizado" vs "rejeitado" — só o primeiro trava o número.

---

## Teste 4 — Recuperação após timeout

Emissão disparada com `curl --max-time 0.5` — conexão abortada pelo cliente aos 508ms,
zero bytes recebidos (`curl exit 28`), sem saber o que aconteceu do lado do servidor.
Evidência: `evidencias/04-emissao-abortada.txt`.

Consulta por `GET /v2/cte/{ref}` (só o ref que a própria aplicação gerou, nenhum ID do
provedor) 2 segundos depois: **`autorizado`, `numero: 4`, chave e XML completos.** O
processamento continuou no servidor independente do cliente ter desistido. Evidência:
`evidencias/04-recuperacao-poll-1.txt`.

**Resposta direta à pergunta do teste:** sim, dá pra descobrir o destino do documento
usando só o `ref` — confirmado com um timeout real, não simulado.

---

## Teste 5 — Numeração explícita

- `numero=10` enviado explicitamente → autorizado com `numero: 10` exato, chave reflete
  o número (`...0000000010...`). Respeitado. Evidência: `05a-numero-explicito-10-resultado.txt`.
- `numero=15` (salto de 10 pra 15, sem 11-14) → aceito e autorizado normalmente, **sem
  nenhuma validação de sequência/contiguidade**, nem por Focus nem pela SEFAZ. Evidência:
  `05b-numero-explicito-15-resultado.txt`.
- `numero=1` de novo (já usado por um CT-e **autorizado** anteriormente) → `erro_autorizacao`,
  `status_sefaz: 539`, *"Rejeicao: Duplicidade de CT-e, com diferença na Chave de Acesso"*,
  citando a chave e o protocolo do CT-e original já autorizado com esse número. Evidência:
  `05c-numero-duplicado-resultado.txt`.

**Resposta direta:** a API respeita o número que eu envio (não numera do lado dela) —
mas só valida **duplicidade contra número já autorizado**, nunca contra buraco/sequência.
O contador de verdade é da SEFAZ, não da Focus, e só rejeita colisão real.

---

## Teste 6 — Eventos (cancelamento e carta de correção)

**Carta de correção — campo aceito:** `campo_corrigido: "natureza_operacao"` → `200`,
`status_sefaz: 135`, evento registrado, XML da CC-e gerado. Evidência:
`06a-carta-correcao-tentativa2-natureza-operacao.txt`.

**Carta de correção — campo recusado (valor):** `campo_corrigido: "icms_valor"` → `400
requisicao_invalida`, `"Campo 'icms_valor' inválido."` — confirma a restrição
documentada (valores/base de cálculo não são corrigíveis). Evidência:
`06a-carta-correcao-tentativa3-valor-proibido.txt`.

**Achado não documentado:** o **mesmo** erro genérico (`"Campo 'X' inválido"`) aparece
tanto pra um nome de campo que não existe (`informacoes_complementares`, minha primeira
tentativa) quanto pra um campo que existe mas é proibido de corrigir (`icms_valor`) — a
API não distingue as duas causas na mensagem. Evidência: `06a-carta-correcao-tentativa1.txt`.

**Cancelamento, no CT-e que já tinha CC-e:** `200`, mas `status: erro_cancelamento`,
`status_sefaz: 523`, *"Rejeição: Vedado o cancelamento quando existir evento de Carta de
Correção."* **Regra de negócio real, não estava em nenhuma documentação que li antes de
executar.** Evidência: `06b-cancelamento.txt`.

**Cancelamento, em CT-e limpo (sem CC-e) emitido só pra este teste:** `200`,
`status: cancelado`, `status_sefaz: 135`, XML de cancelamento gerado normalmente.
Confirma que cancelamento funciona isolado — só é incompatível com CC-e prévia no mesmo
documento. Evidência: `06c-emissao-para-cancelamento.txt`, `06c-cancelamento-puro.txt`.

---

## Teste 7 — MDF-e completo

**Ainda não concluído — mas a causa raiz do erro genérico foi isolada por execução real,
e o payload foi inteiramente remontado a partir da documentação de campos real (não da
página de referência REST, que só lista 4 campos obrigatórios — essa era a causa
provável do erro genérico identificada antes desta retomada).**

### Sessão anterior (6 tentativas) — resumo, sem alteração

1. `evidencias/07-mdfe-tentativa-1.txt` — payload propositalmente incompleto
   (`veiculo_tracao` solto na raiz) → `400 parametros_modal_nao_informados`. Erro
   específico e correto.
2. `evidencias/07a-mdfe-tentativa2.txt` até `evidencias/07e-mdfe-tentativa-veiculo-raiz.txt`
   — cinco variações, todas com `422`, *"The document has no document element"* — erro
   genérico, sem apontar campo nenhum, mesmo com o payload ficando mais completo a cada
   tentativa.

### Retomada — remontagem a partir de `campos.focusnfe.com.br/mdfe/MDFeXML.html` e
`campos.focusnfe.com.br/mdfe/TransporteRodoviarioXML.html`

**Método:** as duas páginas foram baixadas em HTML bruto (`curl`, não só resumo de
ferramenta de busca) e o schema JSON embutido nelas (`{"name":..., "type":...,
"required":..., "tag":...}`) foi extraído diretamente — nível epistêmico "lido e
verificado no HTML fonte", não "resumo de IA". A `WebFetch` inicial dessas páginas
**contradisse a própria doc bruta** num ponto crítico (disse que `conhecimentos_transporte`
é coleção de nível raiz; o HTML bruto confirma que é aninhado dentro de
`municipios_descarregamento[]`, exatamente como você apontou) — registrado como achado
de método, não só resultado.

**Confirmado por leitura direta do HTML/JSON embutido (não de memória):**
- `municipios_descarregamento[].conhecimentos_transporte[].chave_cte` — estrutura
  aninhada confirmada exatamente como você descreveu, contra a leitura errada do
  resumo automático.
- `seguros_carga`: Coleção[1-1000], campos `responsavel_seguro`/`nome_seguradora`/
  `cnpj_seguradora`/`numero_apolice`/`numero_averbacao` — confirmado, nunca tinha sido
  enviado em nenhuma das 6 tentativas anteriores.
- `cep_carregamento`/`cep_descarregamento` — Integer[8], "informar somente quando MDF-e
  for de carga lotação" — confirmado, nunca enviado antes.
- Totalizadores corretos: `peso_bruto` (não `peso_bruto_total`, nome usado
  incorretamente em todas as 6 tentativas anteriores), `valor_total_carga`,
  `codigo_unidade_medida_peso_bruto` (01=KG/02=TON), `quantidade_total_cte`.
  `data_emissao` **não existe em nenhuma das duas páginas de campos** — é campo de
  envelope da API, não do XML, então sua ausência ali não é uma lacuna.
- `emitente` é o próprio `tpEmit` (1=prestador de serviço/2=transportador de carga
  própria/3=prestador que emitirá CT-e Globalizado) — campo escalar de raiz, não um
  objeto. `tipo_transporte`/`tpTransp`: 1=ETC/2=TAC/3=CTC, confirmado.

**Nove tentativas reais adicionais** (evidência completa em cada arquivo,
`evidencias/07g-*.txt` até `07p-*.txt`):

| # | Mudança testada | Resultado |
|---|---|---|
| 07g | Payload remontado inteiro (municípios de descarga aninhados, seguros_carga, ceps, totalizadores corrigidos) + `veiculo_tracao` dentro de `modal_rodoviario` como antes | Mesmo erro genérico — a remontagem completa, sozinha, **não resolveu** |
| 07h | Adicionado `registro_nacional_transporte` (RNTRC) dentro de `modal_rodoviario` — campo que NENHUMA das 9 tentativas anteriores (nem as 6 originais) tinha incluído | **Erro mudou** — de genérico pra específico: `Element 'rodo': Missing child element(s). Expected is (veicTracao)`. RNTRC era necessário pra sair do erro totalmente não-diagnóstico |
| 07i | `veiculo_tracao` com nomes de campo sufixados (`placa_veiculo`/`tara_veiculo`/etc, achados no HTML bruto associados a outro grupo) | Erro idêntico ao 07h |
| 07j | `veiculo_tracao` movido pra raiz do payload (fora de `modal_rodoviario`) | Erro idêntico |
| 07k | `condutores` (motorista) incluído DENTRO de `veiculo_tracao` na própria emissão (não só via evento posterior) | Erro idêntico |
| 07l | Campos do veículo (`placa`/`tara`/etc) soltos direto em `modal_rodoviario`, sem nenhum wrapper, `condutores` também solto | **Erro mudou de novo**: `Element 'condutor': This element is not expected. Expected is (cInt, placa)` — `condutores` solto em `modal_rodoviario` FOI reconhecido e inserido em `veicTracao.condutor`; os campos do veículo em si continuam não reconhecidos |
| 07m | Wrapper `veiculo` (singular, sem "_tracao") em vez de `veiculo_tracao` | Mesmo erro do 07l |
| 07n | `veiculo_tracao` com só `placa` (mínimo, igual ao exemplo literal da referência REST da Focus) | Mesmo erro |
| 07o | `veiculo_tracao` como array de um elemento (`[{...}]`) em vez de objeto solto | Mesmo erro |
| 07p | Adicionado `codigo`/`renavam` dentro de `veiculo_tracao` | Mesmo erro |

### Achado real, não resolvido: a string "veiculo_tracao" não existe em nenhuma das duas
páginas de documentação indicadas

Confirmado por busca no HTML bruto (`grep`, case-insensitive, variações
tração/tracao/trac): **zero ocorrências** em `MDFeXML.html` e em
`TransporteRodoviarioXML.html`. O `collection_type` documentado pra reboque é
`VeiculoReboqueXML` (confirmado, com todos os campos); não existe nenhum
`VeiculoTracaoXML` nem qualquer objeto singular equivalente documentado nessas duas
páginas. A referência REST (`doc.focusnfe.com.br/reference/emitir_mdfe`) mostra um
exemplo mínimo com `"veiculo_tracao": {"placa": "ABC1234"}`, mas esse exemplo — testado
literalmente no item 07n — **não funciona** contra a API real.

Testei sete variações plausíveis da estrutura (wrapper `veiculo_tracao` em três
posições/formatos diferentes, wrapper `veiculo`, campos soltos, com e sem `codigo`) e
nenhuma fez o parser reconhecer sequer um campo do veículo de tração — o erro sempre
volta para "esperava cInt ou placa aqui". **Não sei qual é a chave/estrutura JSON
correta pros campos do veículo de tração (`placa`/`tara`/`capacidade_kg`/`tipo_rodado`/
`tipo_carroceria`/`uf_licenciamento`) — as duas páginas indicadas não documentam isso
sob nenhum nome que eu tenha conseguido encontrar. Não vou adivinhar uma décima
variação sem mais alguma fonte** (mesma disciplina do item 12, alíquota do IBS).

**Ainda não emiti nenhum MDF-e de verdade** — os itens pedidos depois da emissão
(incluir condutor via evento, encerrar, tentar um segundo MDF-e pra mesma placa sem
encerrar o primeiro) **continuam não testados**, sem evidência de execução. Não vou
simular.

**7d — rota de consulta de MDF-e não encerrados por CNPJ:** não existe (já confirmado na
sessão anterior, sem mudança). Evidência: `evidencias/07f-tentativa-listagem-mdfe-por-cnpj.txt`.

**Onde divergiu do esperado (atualizado):** a expectativa original era que a
documentação de campos (que já resolveu o CT-e) fosse suficiente pro MDF-e também. Não
foi — o campo que trava a emissão (o veículo de tração) parece genuinely ausente das
duas páginas específicas indicadas, não só difícil de achar. Ou a documentação tem uma
lacuna real aqui, ou existe uma terceira fonte (outra página, ou um exemplo de payload
completo que a Focus não expõe publicamente) que eu não localizei.

---

## Teste 8 — Arquivos

**XML autorizado + protocolo:** baixado de verdade (`curl`, não simulado) —
`evidencias/arquivos/08-cte-autorizado.xml`, 6879 bytes. Raiz do documento é `<cteProc>`
— contém `<CTe>` **e** `<protCTe>` no mesmo arquivo. Dentro de `<protCTe>`: `<nProt>`
(número de protocolo), `<dhRecbto>`, `<cStat>100</cStat>`,
`<xMotivo>Autorizado o uso do CT-e</xMotivo>`. **Protocolo vem embutido, confirmado
abrindo o arquivo, não só pela presença do campo `caminho_xml` na resposta JSON.**

**DACTE (PDF):** baixado, 65876 bytes, `evidencias/arquivos/08-cte-autorizado-dacte.pdf`.

**XML do rejeitado:** não existe — confirmado por ausência consistente em TODAS as
respostas `erro_autorizacao` desta sessão (testes 1, 3 e 5c), nenhuma trouxe
`caminho_xml`. A API só gera XML pra CT-e que chegou a `autorizado` (ou eventos sobre um
autorizado — cancelamento, CC-e). Não precisei de uma chamada dedicada pra confirmar isso
— já estava consistente nas evidências dos outros testes.

---

## Teste extra — IBS/CBS somam ao valor total do CT-e em 2026?

**Conclusivo por execução real — refeito nesta retomada com os campos certos.** A
primeira tentativa (sessão anterior) usou nomes de campo do grupo ERRADO do XSD —
confirmado pelo suporte da Focus: `ibs_aliquota_uf`/`ibs_valor_tributo_uf`/
`ibs_aliquota_municipio`/`ibs_valor_tributo_municipio`/`ibs_cbs_aliquota`/
`cbs_valor_tributo` (tags `pAliqIBSUF`/`vTribIBSUF`/`pAliqIBSMun`/`vTribIBSMun`/
`pAliqCBS`/`vTribCBS`) são do grupo de **tributação regular/compra governamental**, não
do destaque comum — por isso nunca autorizava, independente da alíquota. Detalhe campo a
campo em `evidencias/teste-extra-ibs-cbs-diferenca.md`. Resumo:

**Campos corretos pro destaque comum** (confirmados no HTML bruto de
`campos.focusnfe.com.br/cte_cteos/ConhecimentoTransporteXML.html`, salvo em
`evidencias/extra-campos-cte-raw.html`, e no exemplo de JSON de
`focusnfe.com.br/guides/reforma-tributaria/`, salvo em
`evidencias/extra-reforma-tributaria-raw.html`): `ibs_cbs_situacao_tributaria` (`CST`,
obrigatório), `ibs_cbs_classificacao_tributaria` (`cClassTrib`, obrigatório),
`ibs_cbs_base_calculo` (`vBC`), `ibs_uf_aliquota` (`pIBSUF`), `ibs_uf_valor` (`vIBSUF`),
`ibs_mun_aliquota` (`pIBSMun`), `ibs_mun_valor` (`vIBSMun`), `ibs_valor_total` (`vIBS`),
`cbs_aliquota` (`pCBS`), `cbs_valor` (`vCBS`).

- **CT-e A (SEM IBS/CBS), valor de prestação 500,00:** autorizado de primeira,
  `status_sefaz: 100`, chave `...061206468055`. XML:
  `evidencias/arquivos/extra2-cte-a-sem-ibscbs.xml`.
- **CT-e B (COM IBS/CBS comum, campos corretos), mesmo valor de prestação:** precisou de
  3 tentativas, as duas primeiras com achado real, não erro de campo:
  1. Só os 8 campos comuns preenchidos → `status_sefaz: 360`, *"Total do DFe de
     preenchimento obrigatório"*. **Achado não documentado:** existe um campo
     `valor_total_dfe` (tag `vTotDFe`, "Valor total do documento fiscal"), listado como
     `required: false` na doc, mas exigido de fato pela SEFAZ assim que o grupo IBS/CBS
     está presente.
  2. `valor_total_dfe: "505.00"` (hipótese: prestação + IBS + CBS) → `status_sefaz: 365`,
     *"Total do DFe inválido"* — rejeitado.
  3. `valor_total_dfe: "500.00"` (hipótese: total do documento = valor da prestação, sem
     somar) → **autorizado**, `status_sefaz: 100`, chave `...071385491534`. XML:
     `evidencias/arquivos/extra2-cte-b-com-ibscbs-comum.xml`.

**Comparação campo a campo dos totalizadores** (XML autorizado):

| Campo | CT-e A (sem) | CT-e B (com) |
|---|---|---|
| `vTPrest` | 500.00 | 500.00 |
| `vRec` | 500.00 | 500.00 |
| `vTotDFe` | *(tag ausente)* | 500.00 |
| `vIBS` (UF 0,50 + Mun 0,00) | *(ausente)* | 0.50 |
| `vCBS` | *(ausente)* | 4.50 |

**Resposta direta, agora com XML autorizado real dos dois lados:** IBS e CBS **não
somam** ao valor total do documento em 2026. `vTPrest`, `vRec` e `vTotDFe` são idênticos
(500,00) com e sem o grupo — os R$ 0,50 de IBS + R$ 4,50 de CBS foram calculados,
destacados e autorizados pela SEFAZ, mas não aparecem somados em nenhum totalizador. A
própria validação de `vTotDFe` pela SEFAZ confirma isso: 505,00 (prestação+tributo) foi
rejeitado, 500,00 (só a prestação) foi aceito. Confirma, agora por uma segunda fonte de
evidência (XML real, não só consulta contábil), a resposta já registrada em
`decisoes.md` D-043 do projeto Mash.

**Confirma também a divisão de linhas filhas por tributo (D-041):** o XML mostra
`gIBSCBS` com dois sub-grupos filhos separados — `gIBSUF` (alíquota+valor estadual) e
`gIBSMun` (alíquota+valor municipal) — cada um com sua própria alíquota e valor, mais
`gCBS` como uma terceira linha (federal), e só depois o totalizador `vIBS` somando UF+Mun.
Não é um campo único de alíquota combinada — é uma linha por competência tributária,
exatamente a modelagem que D-041 já antecipava.

---

## Divergências reais entre documentação e comportamento (resumo)

1. **RNTRC:** meu `EMITENTE_RNTRC` (dado real, do `.env`) tem 9 dígitos; a SEFAZ exige
   exatamente 8 ou `ISENTO`. Isso não é erro de documentação — é um dado que precisa ser
   corrigido antes de qualquer emissão real acontecer. Sinalizado, não corrigido por mim
   (é dado real do usuário).
2. **Payload documentado em `emitir_cte` (referência principal) é insuficiente.** A
   referência REST não lista os ~12 campos que a SEFAZ exige de verdade — só a
   documentação de campos (`campos.focusnfe.com.br`) tem isso, e mesmo ela é
   inconsistente entre buscas pro grupo de IBS/CBS.
3. **Cancelamento vedado depois de CC-e** — regra de negócio real da SEFAZ, não
   encontrada em nenhuma página que li antes de executar.
4. **MDF-e: qualidade de erro muito inferior à do CT-e** uma vez que o payload é
   "grande o bastante" — erro genérico que não aponta nenhum campo, quando o CT-e sempre
   apontou exatamente o elemento XSD esperado. **Atualizado nesta retomada:** o erro
   genérico tinha causa real e diagnosticável (RNTRC ausente em `modal_rodoviario`) —
   depois de corrigido, os erros do MDF-e voltam a ser específicos como os do CT-e. O
   que continua divergente: o campo do veículo de tração não está documentado sob
   nenhum nome que eu tenha encontrado em `campos.focusnfe.com.br/mdfe/MDFeXML.html`
   nem em `.../TransporteRodoviarioXML.html` — só o exemplo mínimo da referência REST
   cita `veiculo_tracao`, e esse exemplo não funciona contra a API real (testado).
5. **Mensagens de erro da SEFAZ passam em português cru** (`status_sefaz` + `mensagem_sefaz`
   com o texto oficial, ex. "Data de Emissao muito atrasada") — não parecem traduzidas
   nem parafraseadas pela Focus.
6. **`WebFetch` (resumo automático por IA) errou um detalhe estrutural que o HTML bruto
   desmente.** Pedindo pra `WebFetch` ler `MDFeXML.html`, a resposta afirmou que
   `conhecimentos_transporte` é uma coleção de nível RAIZ, não aninhada por município —
   o oposto do que o usuário indicou e do que o HTML bruto (baixado com `curl` e
   inspecionado diretamente) confirma: é aninhado dentro de
   `municipios_descarregamento[]`. Reforça a ressalva de método já registrada em
   `plan.md`: ferramenta de resumo automático não é fonte confiável pra estrutura
   aninhada de documentação — teve que ser conferida no HTML/JSON bruto pra ser
   confiável o bastante pra montar payload real.
7. **Resolvido nesta retomada — era campo errado, não alíquota errada.** O bloqueio do
   item 12 (`RESULTADO.md`, cadeia de correção) e da primeira tentativa do "Teste extra"
   nunca foi a alíquota: eram nomes de campo do grupo de tributação
   regular/compra-governamental (`ibs_aliquota_uf` etc.), não do grupo comum
   (`ibs_uf_aliquota` etc. — nomes muito parecidos, ordem das palavras invertida, mesmo
   assim mapeiam pra tags XSD e regras de negócio diferentes). Com os campos certos e a
   alíquota de exemplo da própria Focus (0,1% UF + 0% Mun + 0,9% CBS), autorizou de
   primeira (depois de resolver o campo `valor_total_dfe`, item 8 abaixo). **Achado de
   método:** a documentação de campos (`campos.focusnfe.com.br`) tem os dois grupos
   muito próximos um do outro no HTML/JSON embutido, com nomes quase idênticos — fácil de
   pegar o errado sem ler o bruto com atenção total (o resumo automático de busca não
   distinguiu os dois na primeira leitura desta sessão).
8. **Campo `valor_total_dfe` (tag `vTotDFe`) não documentado como condicionalmente
   obrigatório.** A doc de campos marca `required: false`, mas a SEFAZ rejeita
   (`status_sefaz: 360`) qualquer CT-e com o grupo IBS/CBS preenchido e esse campo
   ausente. Nem `campos.focusnfe.com.br` nem `focusnfe.com.br/guides/reforma-tributaria/`
   deixam essa condicionalidade explícita — só a resposta real da SEFAZ revelou.

Não concluo se o provedor é bom ou ruim — os itens acima são o que aconteceu, com
evidência. A avaliação de adequação é decisão sua.
