import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

// Percentuais na mesma convenção de calculateQuotePricing/
// FreightRate.additionalPercentage (D-013): o número É a porcentagem.
export interface TaxOnAgreedValueInput {
  value: Decimal | string;
  icmsRatePercent: Decimal | string;
  ibsRatePercent: Decimal | string;
  cbsRatePercent: Decimal | string;
}

export interface TaxOnAgreedValueResult {
  icmsAmount: Decimal;
  ibsAmount: Decimal;
  cbsAmount: Decimal;
  // Sempre igual a `value` de entrada — ver comentário da função.
  finalPrice: Decimal;
}

// Gross-up não é universal (D-043, consulta tributária,
// docs/consulta-tributaria-2026-09.md): `preço = base ÷ (1 − alíquota)`
// (calculateQuotePricing, @mash/shared, shared/src/quote-pricing/) só vale
// quando se parte de um valor líquido-alvo — o caminho de custo (custo +
// margem, D-041). Quando o preço JÁ É o valor acordado (caminho da
// FreightRate/TABELA, D-018), a base é o próprio valor e só se
// multiplica pela alíquota — não se divide, porque não existe "valor
// líquido" a recompor: o cliente já concordou com este número, e os
// tributos aqui são destaque informativo sobre ele, nunca uma segunda
// fonte de verdade sobre quanto cobrar.
//
// Por isso finalPrice é sempre === value: esta função nunca MUDA o
// preço, só decompõe o que já está fechado em tributos destacados. Isso
// vale independente de ibsComposesPrice/cbsComposesPrice (D-043) — nesse
// caminho "compor o preço" não é uma pergunta que faz sentido, porque
// não há recomposição nenhuma acontecendo; por isso a função não recebe
// esses parâmetros (diferente de calculateQuotePricing).
//
// NÃO CONECTADA A NENHUM CAMINHO DE PRODUÇÃO AINDA — existe pra que o
// caminho TABELA, quando precisar de destaque de tributo (D-006,
// emissão de CT-e, ainda não construída), tenha a função certa pronta em
// vez de alguém reaproveitar calculateQuotePricing (gross-up) por
// engano. Ver docs/decisoes.md D-043.
export function calculateTaxOnAgreedValue(
  input: TaxOnAgreedValueInput,
): TaxOnAgreedValueResult {
  const value = new Decimal(input.value);
  const icmsRate = new Decimal(input.icmsRatePercent).dividedBy(100);
  const ibsRate = new Decimal(input.ibsRatePercent).dividedBy(100);
  const cbsRate = new Decimal(input.cbsRatePercent).dividedBy(100);

  return {
    icmsAmount: value.times(icmsRate),
    ibsAmount: value.times(ibsRate),
    cbsAmount: value.times(cbsRate),
    finalPrice: value,
  };
}
