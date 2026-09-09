import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

export interface QuotePricingCostLineInput {
  amount: Decimal | string;
}

// Percentuais na mesma convenção de FreightRate.additionalPercentage
// (D-013): o número É a porcentagem ("18" = 18%, "0.1" = 0,1%), não uma
// fração 0-1 — dividimos por 100 aqui dentro, uma vez só.
//
// ibsComposesPrice/cbsComposesPrice (D-043, correção): vêm de
// TaxRate.composesPrice — durante a calibragem (2026) são `false`
// (consulta tributária, docs/consulta-tributaria-2026-09.md: "IBS e CBS
// são informativos... NÃO somam ao valor cobrado do cliente"). Sem
// parâmetro pra ICMS: ele sempre compõe o preço (sempre esteve "por
// dentro"), isso não mudou e não tem vigência que altere esse fato.
export interface QuotePricingInput {
  costLines: QuotePricingCostLineInput[];
  icmsRatePercent: Decimal | string;
  ibsRatePercent: Decimal | string;
  ibsComposesPrice: boolean;
  cbsRatePercent: Decimal | string;
  cbsComposesPrice: boolean;
  marginRatePercent: Decimal | string;
}

export interface QuotePricingBreakdownLine {
  label: string;
  amount: Decimal;
}

// Tudo em precisão cheia (D-013) — nenhum arredondamento aqui dentro.
// Arredondar fica pra quem persiste o `total` no banco (Decimal(14,2)),
// não pra esta função: arredondar no meio da recomposição gera diferença
// de centavos impossível de explicar depois.
export interface QuotePricingResult {
  costSubtotal: Decimal;
  icmsAmount: Decimal;
  // Preço depois só do ICMS (etapa 1) — antes de IBS/CBS entrarem
  // (etapa 2). Exposto separado, não só o total combinado: é o que prova
  // que as duas etapas rodaram na ordem certa, não misturadas num pool
  // (detalhamento visível, não caixa preta).
  priceAfterIcms: Decimal;
  ibsAmount: Decimal;
  cbsAmount: Decimal;
  taxAmount: Decimal;
  priceBeforeMargin: Decimal;
  marginAmount: Decimal;
  finalPrice: Decimal;
  breakdown: QuotePricingBreakdownLine[];
}

// Pipeline de 4 etapas (D-041): soma dos custos → recomposição do
// imposto → aplicação da margem → preço. Pura, sem banco — quem persiste
// (QuoteService.close()) lê as alíquotas de TaxRate e chama esta função.
//
// A "recomposição do imposto" é, na verdade, DUAS etapas em sequência,
// não um pool único — correção de 08/09/2026: a primeira versão tratava
// ICMS/IBS/CBS como um só gross-up (`custo ÷ (1 − Σ alíquotas)`), o que
// está ERRADO — os tributos da Reforma (IBS/CBS) não entram na própria
// base, só o ICMS entra. A diferença é invisível com as alíquotas de
// calibragem de 2026 (0,1%/0,9%) — é justamente por isso que precisa
// estar certo agora, antes que a alíquota real (não mais teste) torne o
// erro visível em produção.
//
// Etapa 1 — ICMS "por dentro": entra na própria base.
//   preço_com_icms = custo ÷ (1 − alíquota_icms)
//
// Etapa 2 — IBS/CBS "por fora": somados em cima do preço já com ICMS,
// SEM entrar na própria base (não é gross-up, é acréscimo simples) — MAS
// só se ibsComposesPrice/cbsComposesPrice disserem que sim (D-043,
// correção). O valor de cada tributo é sempre calculado e devolvido
// (destaque no documento, "a etapa continua existindo e produzindo os
// valores" — consulta tributária) — o que muda é se ele entra na conta
// do preço final. Em 2026, ibsComposesPrice/cbsComposesPrice vêm `false`
// da vigência de TaxRate: os dois são somados como zero na composição,
// mas ibsAmount/cbsAmount no retorno continuam com o valor calculado.
//   preço_com_impostos = preço_com_icms
//     + (ibsComposesPrice ? preço_com_icms × ibs : 0)
//     + (cbsComposesPrice ? preço_com_icms × cbs : 0)
//
// Etapa 3 — margem "por dentro": só isso é premissa nossa, não dado
// fornecido feito o ICMS. É a leitura que faz "margem sai igual à pedida
// depois da recomposição" ser verdade (margem como % do PREÇO final, não
// do custo) — mas margem "por dentro" vs "por fora" produz números
// DIFERENTES, e qual delas o operador está pedindo quando digita "18%"
// não foi validado com o sócio. Registrado como PENDÊNCIA em
// docs/decisoes.md D-041 — não trocar esta implementação sem essa
// validação, e não tratar o valor abaixo como decisão fechada.
//   preço_final = preço_com_impostos ÷ (1 − margem)
export function calculateQuotePricing(
  input: QuotePricingInput,
): QuotePricingResult {
  const costSubtotal = input.costLines.reduce(
    (sum, line) => sum.plus(new Decimal(line.amount)),
    new Decimal(0),
  );

  const icmsRate = new Decimal(input.icmsRatePercent).dividedBy(100);
  const ibsRate = new Decimal(input.ibsRatePercent).dividedBy(100);
  const cbsRate = new Decimal(input.cbsRatePercent).dividedBy(100);
  const marginRate = new Decimal(input.marginRatePercent).dividedBy(100);

  // Etapa 1 — ICMS por dentro.
  const priceAfterIcms = costSubtotal.dividedBy(new Decimal(1).minus(icmsRate));
  const icmsAmount = priceAfterIcms.minus(costSubtotal);

  // Etapa 2 — IBS/CBS por fora, sobre o preço já com ICMS. Sempre
  // calculados (destaque no documento) — só entram na composição do
  // preço se a vigência disser que compõem (D-043).
  const ibsAmount = priceAfterIcms.times(ibsRate);
  const cbsAmount = priceAfterIcms.times(cbsRate);
  const priceBeforeMargin = priceAfterIcms
    .plus(input.ibsComposesPrice ? ibsAmount : new Decimal(0))
    .plus(input.cbsComposesPrice ? cbsAmount : new Decimal(0));
  const taxAmount = priceBeforeMargin.minus(costSubtotal);

  // Etapa 3 — margem (por dentro — ver pendência de validação acima).
  const finalPrice = priceBeforeMargin.dividedBy(
    new Decimal(1).minus(marginRate),
  );
  const marginAmount = finalPrice.minus(priceBeforeMargin);

  return {
    costSubtotal,
    icmsAmount,
    priceAfterIcms,
    ibsAmount,
    cbsAmount,
    taxAmount,
    priceBeforeMargin,
    marginAmount,
    finalPrice,
    breakdown: [
      { label: 'Custo', amount: costSubtotal },
      { label: 'ICMS', amount: icmsAmount },
      {
        // D-043: rótulo avisa quando o valor é só destaque — sem isso,
        // uma linha "IBS: R$ 4,50" no detalhamento parece ter sido
        // somada ao preço, quando na calibragem de 2026 não foi.
        label: input.ibsComposesPrice ? 'IBS' : 'IBS (informativo, não compõe o preço)',
        amount: ibsAmount,
      },
      {
        label: input.cbsComposesPrice ? 'CBS' : 'CBS (informativo, não compõe o preço)',
        amount: cbsAmount,
      },
      { label: 'Margem', amount: marginAmount },
      { label: 'Preço final', amount: finalPrice },
    ],
  };
}
