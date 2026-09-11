import { describe, expect, it } from 'vitest';
import { closeQuoteSchema } from './close-quote.schema.js';

describe('closeQuoteSchema', () => {
  it('aceita prazo em dias ou meses', () => {
    expect(
      closeQuoteSchema.safeParse({
        validityTerm: { unit: 'DAYS', amount: 3 },
      }).success,
    ).toBe(true);
    expect(
      closeQuoteSchema.safeParse({
        validityTerm: { unit: 'MONTHS', amount: 1 },
      }).success,
    ).toBe(true);
  });

  it('recusa prazo ausente — obrigatório na tela', () => {
    expect(closeQuoteSchema.safeParse({}).success).toBe(false);
  });

  it('recusa quantidade zero, negativa ou fracionária', () => {
    expect(
      closeQuoteSchema.safeParse({ validityTerm: { unit: 'DAYS', amount: 0 } })
        .success,
    ).toBe(false);
    expect(
      closeQuoteSchema.safeParse({
        validityTerm: { unit: 'DAYS', amount: -3 },
      }).success,
    ).toBe(false);
    expect(
      closeQuoteSchema.safeParse({
        validityTerm: { unit: 'DAYS', amount: 1.5 },
      }).success,
    ).toBe(false);
  });

  it('recusa unidade que não existe', () => {
    expect(
      closeQuoteSchema.safeParse({
        validityTerm: { unit: 'WEEKS', amount: 1 },
      }).success,
    ).toBe(false);
  });
});
