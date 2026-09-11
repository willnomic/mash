import { describe, expect, it } from 'vitest';
import { computeQuoteValidUntil } from './quote-validity.due-date.js';

describe('computeQuoteValidUntil', () => {
  it('soma dias corridos', () => {
    const result = computeQuoteValidUntil(new Date('2026-01-20T00:00:00Z'), {
      unit: 'DAYS',
      amount: 10,
    });

    expect(result.toISOString().slice(0, 10)).toBe('2026-01-30');
  });

  it('soma dias corridos cruzando o limite do mês', () => {
    const result = computeQuoteValidUntil(new Date('2026-01-30T00:00:00Z'), {
      unit: 'DAYS',
      amount: 5,
    });

    expect(result.toISOString().slice(0, 10)).toBe('2026-02-04');
  });

  it('soma meses quando o dia existe no mês de destino', () => {
    const result = computeQuoteValidUntil(new Date('2026-01-15T00:00:00Z'), {
      unit: 'MONTHS',
      amount: 1,
    });

    expect(result.toISOString().slice(0, 10)).toBe('2026-02-15');
  });

  it('gruda no último dia do mês de destino quando o dia não existe (não bissexto)', () => {
    // 2027 não é bissexto — fevereiro tem 28 dias.
    const result = computeQuoteValidUntil(new Date('2027-01-31T00:00:00Z'), {
      unit: 'MONTHS',
      amount: 1,
    });

    expect(result.toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('gruda no dia 29 em fevereiro de ano bissexto', () => {
    // 2028 é bissexto — fevereiro tem 29 dias.
    const result = computeQuoteValidUntil(new Date('2028-01-31T00:00:00Z'), {
      unit: 'MONTHS',
      amount: 1,
    });

    expect(result.toISOString().slice(0, 10)).toBe('2028-02-29');
  });

  it('soma meses cruzando o limite do ano', () => {
    const result = computeQuoteValidUntil(new Date('2026-11-30T00:00:00Z'), {
      unit: 'MONTHS',
      amount: 3,
    });

    // Fevereiro de 2027 (não bissexto) tem 28 dias — grudou.
    expect(result.toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('soma vários meses sem dia problemático', () => {
    const result = computeQuoteValidUntil(new Date('2026-03-10T00:00:00Z'), {
      unit: 'MONTHS',
      amount: 6,
    });

    expect(result.toISOString().slice(0, 10)).toBe('2026-09-10');
  });
});
