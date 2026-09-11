import fs from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { calculateTaxOnAgreedValue } from '../src/tax-rate/tax-composition-calculator.js';
import { calculateQuotePricing } from '@mash/shared';

// Não precisa de banco — função pura (D-043). Roda como unitário (npm
// test), mesmo critério de shared/src/quote-pricing/quote-pricing-calculator.spec.ts.
describe('calculateTaxOnAgreedValue · gross-up não é universal (D-043)', () => {
  it('multiplica, nunca divide: tributo = valor × alíquota, sem gross-up', () => {
    const result = calculateTaxOnAgreedValue({
      value: '1000',
      icmsRatePercent: '18',
      ibsRatePercent: '0.1',
      cbsRatePercent: '0.9',
    });

    // Simples multiplicação — não 1000/(1-0.18).
    expect(result.icmsAmount.toString()).toBe('180');
    expect(result.ibsAmount.toString()).toBe('1');
    expect(result.cbsAmount.toString()).toBe('9');
  });

  it('preço final é sempre o valor de entrada, nunca recalculado', () => {
    const result = calculateTaxOnAgreedValue({
      value: '1000',
      icmsRatePercent: '18',
      ibsRatePercent: '0.1',
      cbsRatePercent: '0.9',
    });

    expect(result.finalPrice.toString()).toBe('1000');
  });

  it('as duas funções divergem no MESMO número de entrada — prova que não são intercambiáveis', () => {
    // Mesmo "valor" tratado como base líquida por uma função (gross-up,
    // caminho CUSTO) e como valor já acordado pela outra (multiplicação
    // simples, caminho TABELA/agreed-value) — os resultados de ICMS têm
    // que ser DIFERENTES, senão as duas funções seriam a mesma coisa
    // disfarçada e a separação não teria sentido.
    const grossUp = calculateQuotePricing({
      costLines: [{ amount: '1000' }],
      icmsRatePercent: '18',
      ibsRatePercent: '0',
      ibsComposesPrice: true,
      cbsRatePercent: '0',
      cbsComposesPrice: true,
      marginRatePercent: '0',
    });
    const multiplicacaoSimples = calculateTaxOnAgreedValue({
      value: '1000',
      icmsRatePercent: '18',
      ibsRatePercent: '0',
      cbsRatePercent: '0',
    });

    // Gross-up: 1000 / (1 - 0.18) = 1219.51... → ICMS = 219.51...
    // Multiplicação simples: 1000 × 0.18 = 180 exato.
    expect(grossUp.icmsAmount.toString()).not.toBe(
      multiplicacaoSimples.icmsAmount.toString(),
    );
    expect(multiplicacaoSimples.icmsAmount.toString()).toBe('180');
    expect(grossUp.priceAfterIcms.toString()).not.toBe('1000');
  });

  it('valor usa .times(), nunca operador nativo (D-013)', () => {
    const value = new Prisma.Decimal('500');
    const rate = new Prisma.Decimal('18');

    // .times() é o caminho correto — mesmo alerta de D-013 que já cobre
    // .plus() nos outros arquivos de teste, aqui pra multiplicação.
    const correct = value.times(rate).dividedBy(100);
    expect(correct.toString()).toBe('90');

    const result = calculateTaxOnAgreedValue({
      value,
      icmsRatePercent: rate,
      ibsRatePercent: '0',
      cbsRatePercent: '0',
    });
    expect(result.icmsAmount.toString()).toBe('90');
  });

  it('QuoteService só chama calculateQuotePricing (gross-up), nunca calculateTaxOnAgreedValue — confirmado por leitura do arquivo, não por convenção assumida (D-043)', () => {
    // Trava estrutural real, não decorativa: lê o código-fonte de
    // QuoteService e confirma que a função de multiplicação simples
    // (feita pro caminho TABELA/agreed-value, ainda sem nenhum caminho
    // de produção usando ela) não está importada nem chamada ali — só
    // calculateQuotePricing (gross-up, certo pro caminho CUSTO) está.
    // Se algum dia isso mudar sem querer, este teste quebra na hora.
    const quoteServiceSource = fs.readFileSync(
      path.resolve(__dirname, '../src/quote/quote.service.ts'),
      'utf8',
    );

    expect(quoteServiceSource).toMatch(/calculateQuotePricing/);
    expect(quoteServiceSource).not.toMatch(/calculateTaxOnAgreedValue/);
  });
});
