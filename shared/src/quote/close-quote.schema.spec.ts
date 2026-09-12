import { describe, expect, it } from 'vitest';
import { closeQuoteSchema } from './close-quote.schema.js';

describe('closeQuoteSchema', () => {
  it('aceita prazo em dias, meses ou anos', () => {
    expect(
      closeQuoteSchema.safeParse({
        validity: { type: 'TERM', term: { unit: 'DAYS', amount: 3 } },
      }).success,
    ).toBe(true);
    expect(
      closeQuoteSchema.safeParse({
        validity: { type: 'TERM', term: { unit: 'MONTHS', amount: 1 } },
      }).success,
    ).toBe(true);
    expect(
      closeQuoteSchema.safeParse({
        validity: { type: 'TERM', term: { unit: 'YEARS', amount: 1 } },
      }).success,
    ).toBe(true);
  });

  // Unidade "configuração do tenant": NEVER é escolha EXPLÍCITA, não a
  // ausência de "validity" — os dois são coisas diferentes de propósito.
  it('aceita "não vence" (NEVER) como decisão explícita', () => {
    expect(
      closeQuoteSchema.safeParse({ validity: { type: 'NEVER' } }).success,
    ).toBe(true);
  });

  it('recusa decisão de validade ausente — prazo OU "não vence" é obrigatório', () => {
    expect(closeQuoteSchema.safeParse({}).success).toBe(false);
    expect(closeQuoteSchema.safeParse({ validity: {} }).success).toBe(false);
  });

  it('recusa "term" ausente quando type é TERM', () => {
    expect(
      closeQuoteSchema.safeParse({ validity: { type: 'TERM' } }).success,
    ).toBe(false);
  });

  it('recusa quantidade zero, negativa ou fracionária', () => {
    expect(
      closeQuoteSchema.safeParse({
        validity: { type: 'TERM', term: { unit: 'DAYS', amount: 0 } },
      }).success,
    ).toBe(false);
    expect(
      closeQuoteSchema.safeParse({
        validity: { type: 'TERM', term: { unit: 'DAYS', amount: -3 } },
      }).success,
    ).toBe(false);
    expect(
      closeQuoteSchema.safeParse({
        validity: { type: 'TERM', term: { unit: 'DAYS', amount: 1.5 } },
      }).success,
    ).toBe(false);
  });

  it('recusa unidade que não existe', () => {
    expect(
      closeQuoteSchema.safeParse({
        validity: { type: 'TERM', term: { unit: 'WEEKS', amount: 1 } },
      }).success,
    ).toBe(false);
  });

  it('recusa "type" que não existe', () => {
    expect(
      closeQuoteSchema.safeParse({ validity: { type: 'FOREVER' } }).success,
    ).toBe(false);
  });
});
