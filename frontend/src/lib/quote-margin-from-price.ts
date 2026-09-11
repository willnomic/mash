import { Decimal } from 'decimal.js'

// Inversão de calculateQuotePricing (@mash/shared, D-048): a função pura
// só vai de margem → preço final (D-041 — margem "por dentro"). O modo
// "digitar preço final" da tela precisa do caminho inverso: que margem
// produz o preço que o operador digitou. A BASE (soma dos custos +
// recomposição de ICMS/IBS/CBS, ou seja `priceBeforeMargin`) sempre vem
// de calculateQuotePricing — nunca reimplementada aqui, só a álgebra de
// isolar a margem, que a função original não expõe:
//
//   preço_final = priceBeforeMargin ÷ (1 − margem)
//   margem = 1 − priceBeforeMargin ÷ preço_final
//
// D-013 sem exceção: Decimal ponta a ponta, .minus()/.dividedBy()/
// .times() — esta margem é a mesma que vai no corpo do POST (não é só
// exibição), então a mesma disciplina de dinheiro/percentual vale aqui.
export type MarginFromPriceResult =
  | { ok: true; marginPercent: Decimal }
  | { ok: false; reason: 'no-cost' | 'below-cost' }

export function deriveMarginPercentFromFinalPrice(
  priceBeforeMargin: Decimal,
  typedFinalPrice: Decimal,
): MarginFromPriceResult {
  if (priceBeforeMargin.lessThanOrEqualTo(0)) {
    // Sem custo lançado ainda, todo preço final produz o mesmo preço
    // (zero) nesta base — não tem margem que resolva a equação.
    return { ok: false, reason: 'no-cost' }
  }
  if (typedFinalPrice.lessThanOrEqualTo(priceBeforeMargin)) {
    // Margem "por dentro" exige preço final MAIOR que a base (senão o
    // resultado é margem negativa — fora do que esta unidade valida,
    // ver createCostBasedQuoteSchema).
    return { ok: false, reason: 'below-cost' }
  }
  const marginRate = new Decimal(1).minus(
    priceBeforeMargin.dividedBy(typedFinalPrice),
  )
  return { ok: true, marginPercent: marginRate.times(100) }
}
