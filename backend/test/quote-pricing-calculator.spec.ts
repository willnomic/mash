import { Prisma } from '@prisma/client';
import { calculateQuotePricing } from '../src/quote/quote-pricing-calculator.js';

// Não precisa de banco — pipeline puro (D-041). Roda como unitário
// (npm test), mesmo critério de freight-rate-decimal.spec.ts.
describe('QuotePricingCalculator · recomposição de imposto e margem (D-041)', () => {
  it('etapa 1 isolada: ICMS por dentro — preço = base ÷ (1 − alíquota)', () => {
    // IBS/CBS/margem zerados — confere só a etapa 1, isolada das demais.
    const result = calculateQuotePricing({
      costLines: [{ amount: '100' }],
      icmsRatePercent: '20',
      ibsRatePercent: '0',
      cbsRatePercent: '0',
      marginRatePercent: '0',
    });

    // 100 / (1 - 0.20) = 100 / 0.80 = 125
    expect(result.priceAfterIcms.toString()).toBe('125');
    expect(result.icmsAmount.toString()).toBe('25');
    expect(result.finalPrice.toString()).toBe('125');
  });

  it('etapa 2 isolada: IBS/CBS por fora — soma simples sobre o preço já com ICMS, NÃO gross-up', () => {
    // ICMS/margem zerados — confere só a etapa 2, isolada das demais.
    // Se IBS/CBS fossem por dentro (gross-up), 1000/(1-0.01) daria
    // 1010.101010... (dízima) — o resultado exato abaixo (1010, sem
    // dízima) só sai de "por fora" (soma simples).
    const result = calculateQuotePricing({
      costLines: [{ amount: '1000' }],
      icmsRatePercent: '0',
      ibsRatePercent: '0.1',
      cbsRatePercent: '0.9',
      marginRatePercent: '0',
    });

    expect(result.priceAfterIcms.toString()).toBe('1000');
    expect(result.ibsAmount.toString()).toBe('1');
    expect(result.cbsAmount.toString()).toBe('9');
    // 1000 + 1 + 9 = 1010 (soma simples — "por fora" de verdade).
    expect(result.priceBeforeMargin.toString()).toBe('1010');
    expect(result.finalPrice.toString()).toBe('1010');
  });

  it('caso conferido à mão, pipeline completo: custo 820, ICMS 18% por dentro, IBS 0,1% + CBS 0,9% por fora, margem 20%', () => {
    // Escolhido pra fechar sem dízima em toda etapa, pra poder escrever
    // o número esperado no teste (D-041 pede isso explicitamente):
    // etapa 1 — 820 / (1 - 0.18) = 820 / 0.82 = 1000 exato.
    // etapa 2 — 1000 + (1000×0.001) + (1000×0.009) = 1000 + 1 + 9 = 1010.
    // etapa 3 — 1010 / (1 - 0.20) = 1010 / 0.80 = 1262.5 exato.
    const result = calculateQuotePricing({
      costLines: [{ amount: '400' }, { amount: '300' }, { amount: '120' }],
      icmsRatePercent: '18',
      ibsRatePercent: '0.1',
      cbsRatePercent: '0.9',
      marginRatePercent: '20',
    });

    expect(result.costSubtotal.toString()).toBe('820');
    expect(result.priceAfterIcms.toString()).toBe('1000');
    expect(result.icmsAmount.toString()).toBe('180');
    expect(result.ibsAmount.toString()).toBe('1');
    expect(result.cbsAmount.toString()).toBe('9');
    expect(result.priceBeforeMargin.toString()).toBe('1010');
    expect(result.taxAmount.toString()).toBe('190');
    expect(result.marginAmount.toString()).toBe('252.5');
    expect(result.finalPrice.toString()).toBe('1262.5');

    // Soma das linhas do detalhamento bate com o preço final — prova que
    // nada "sumiu" arredondando no meio (D-013).
    const breakdownSum = result.costSubtotal
      .plus(result.icmsAmount)
      .plus(result.ibsAmount)
      .plus(result.cbsAmount)
      .plus(result.marginAmount);
    expect(breakdownSum.toString()).toBe(result.finalPrice.toString());
  });

  it('margem sai igual à pedida depois da recomposição — prova que a ordem das etapas está certa', () => {
    const result = calculateQuotePricing({
      costLines: [{ amount: '820' }],
      icmsRatePercent: '18',
      ibsRatePercent: '0.1',
      cbsRatePercent: '0.9',
      marginRatePercent: '20',
    });

    // Margem (por dentro — pendência de validação com o sócio, D-041) é
    // % do PREÇO final: se a ordem ou a fórmula estivessem erradas (ex.:
    // markup sobre custo, ou margem antes do imposto), essa razão não
    // bateria com 0.20.
    const marginRatio = result.marginAmount.dividedBy(result.finalPrice);
    expect(marginRatio.toString()).toBe('0.2');
  });

  it('erro que a calculadora comete: somar margem ao custo (markup) e só depois recompor imposto perde margem', () => {
    // Mesmo cenário do caso conferido à mão, mas calculado do jeito
    // ERRADO (markup sobre custo, depois gross-up de imposto) — prova
    // que dá uma margem REALIZADA abaixo dos 20% pedidos. Não é o que
    // calculateQuotePricing faz; é a demonstração do erro que ele existe
    // pra evitar.
    const correct = calculateQuotePricing({
      costLines: [{ amount: '820' }],
      icmsRatePercent: '18',
      ibsRatePercent: '0.1',
      cbsRatePercent: '0.9',
      marginRatePercent: '20',
    });

    const cost = new Prisma.Decimal('820');
    const wrongPriceWithMarkup = cost.times('1.20'); // markup sobre custo
    const wrongMarginRealized = wrongPriceWithMarkup
      .minus(cost)
      .dividedBy(wrongPriceWithMarkup);

    expect(wrongMarginRealized.lessThan('0.2')).toBe(true);
    // O resultado CORRETO (nosso pipeline) preserva os 20% pedidos — o
    // markup, não.
    expect(correct.marginAmount.dividedBy(correct.finalPrice).toString()).toBe(
      '0.2',
    );
  });

  it('soma das linhas de custo usa .plus(), nunca operador nativo (D-013)', () => {
    const a = new Prisma.Decimal('400');
    const b = new Prisma.Decimal('300');

    // @ts-expect-error — demonstração deliberada: "+" em Decimal cai pra
    // toString() e concatena, não soma (mesmo alerta de
    // freight-rate-decimal.spec.ts, vale igual aqui).
    const wrong = a + b;
    expect(wrong).toBe('400300');

    const result = calculateQuotePricing({
      costLines: [{ amount: a }, { amount: b }],
      icmsRatePercent: '0',
      ibsRatePercent: '0',
      cbsRatePercent: '0',
      marginRatePercent: '0',
    });
    expect(result.costSubtotal.toString()).toBe('700');
  });
});
