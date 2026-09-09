# Consulta tributária — setembro/2026

Consulta contábil que fundamenta a correção da D-041 e a ampliação de `TaxRate`
(D-043). Texto conforme recebido do usuário, sem edição — é a evidência que
justifica cada mudança de modelo, não um resumo.

---

## Erro a corrigir

Durante a fase de calibragem (2026), IBS e CBS são informativos: os valores são
calculados e destacados no documento, mas NÃO somam ao valor cobrado do cliente.
ICMS e ISS continuam abatíveis da base de IBS/CBS até 2032; os tributos novos só
compõem preço de verdade depois.

O pipeline soma IBS/CBS ao preço final. A etapa continua existindo e produzindo
os valores, mas a composição no preço vira parâmetro com vigência, não
constante. Em 2026 o parâmetro é "não compõe".

## Gross-up não é universal

`preço = base ÷ (1 − alíquota)` só vale quando se parte de um valor
líquido-alvo (caminho de custo: custo + margem). Quando o preço já é o valor
acordado (caminho da FreightRate), a base é o próprio valor e só se multiplica
pela alíquota. Os dois caminhos não podem chamar a mesma função cegamente.

## TaxRate precisa de três casos de ICMS, não um

1. **Interna** (origem e destino na mesma UF): alíquota própria de cada UF,
   hoje majoritariamente entre 17% e 22%. Muda por lei estadual — vigência
   importa.
2. **Interestadual**: regra do Senado. 7% quando a origem é Sul/Sudeste
   (exceto ES) e o destino é Norte/Nordeste/Centro-Oeste/ES; 12% em todo o
   resto. Modelar como flag de grupo por UF, não como matriz 27x27.
3. **Intramunicipal** (mesmo município): sem ICMS.

Alíquotas internas continuam marcadas como placeholder até virem confirmadas
uma a uma — o guarda de falha fechada que já existe permanece.

## Regime tributário vira configuração do tenant

- CST de ICMS: 00 para regime normal (Presumido/Real); 90 para Simples
  Nacional, com indicador de contribuinte do Simples à parte. Não existe
  CSOSN no CT-e.
- Para o Simples, o ICMS de transporte intermunicipal e interestadual é
  recolhido POR FORA do DAS — não é isento. Só o intramunicipal entra no DAS.
- IBS/CBS: obrigatório para Presumido e Real; facultativo para Simples e MEI
  em 2026.
- A partir de 2027 existe "Simples Híbrido" (LC 214/2025): a empresa pode
  apurar IBS/CBS fora do DAS. Isso significa que "regime de apuração de
  IBS/CBS" é um campo SEPARADO do regime de renda. Reservar o assento, não
  construir o fluxo.

## CST e cClassTrib não são constantes

Caso padrão de transporte rodoviário de carga tributado integralmente: CST 000
+ cClassTrib 000001. Mas a tabela oficial tem mais de 160 códigos e é
atualizada por Nota Técnica.

Modelar como tabela de dado (mesmo critério da D-020: tenantId nulo = padrão
do sistema), não enum. Semear só o caso padrão. Registrar como pendência a
atualização periódica a partir da tabela oficial do Portal Nacional.

## Registrar, não construir

Crédito presumido de 20% (Convênio ICMS 106/96) é benefício de APURAÇÃO — não
altera o vICMS destacado no CT-e. É opção da transportadora, substitutivo de
outros créditos, não aplicável a transporte aéreo. Registrar como fora de
escopo do documento fiscal, para não ser confundido depois.
