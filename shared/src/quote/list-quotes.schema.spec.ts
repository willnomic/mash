import { describe, expect, it } from 'vitest';
import { listQuotesQuerySchema } from './list-quotes.schema.js';

describe('listQuotesQuerySchema', () => {
  it('aceita query vazia — page/pageSize default, filtros ausentes', () => {
    const result = listQuotesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ page: 1, pageSize: 20 });
  });

  it('coage page/pageSize de string (query HTTP real) e de number (TanStack Router)', () => {
    expect(
      listQuotesQuerySchema.safeParse({ page: '2', pageSize: '10' }).success,
    ).toBe(true);
    expect(
      listQuotesQuerySchema.safeParse({ page: 2, pageSize: 10 }).success,
    ).toBe(true);
  });

  it('recusa status fora dos seis valores da tela', () => {
    expect(
      listQuotesQuerySchema.safeParse({ status: 'CLOSED_LOST' }).success,
    ).toBe(false);
  });

  it('aceita CLOSED_EXPIRED e CLOSED_NO_EXPIRY — valores de filtro, nunca status gravado', () => {
    expect(
      listQuotesQuerySchema.safeParse({ status: 'CLOSED_EXPIRED' }).success,
    ).toBe(true);
    expect(
      listQuotesQuerySchema.safeParse({ status: 'CLOSED_NO_EXPIRY' }).success,
    ).toBe(true);
  });

  it('recusa partyId que não é uuid', () => {
    expect(
      listQuotesQuerySchema.safeParse({ partyId: 'x' }).success,
    ).toBe(false);
  });

  it('recusa page/pageSize menor que 1, e pageSize acima do teto', () => {
    expect(listQuotesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(
      listQuotesQuerySchema.safeParse({ pageSize: 101 }).success,
    ).toBe(false);
  });

  it('q vazio ou só espaço é rejeitado — busca sem texto não é busca', () => {
    expect(listQuotesQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(listQuotesQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
  });
});
