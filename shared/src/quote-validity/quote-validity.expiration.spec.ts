import { describe, expect, it } from 'vitest';
import { isQuoteValidityExpired } from './quote-validity.expiration.js';

describe('isQuoteValidityExpired', () => {
  it('nunca expira sem validUntil', () => {
    expect(
      isQuoteValidityExpired(null, new Date('2099-01-01T00:00:00Z')),
    ).toBe(false);
  });

  it('não expirou quando a referência é anterior ao vencimento', () => {
    expect(
      isQuoteValidityExpired(
        new Date('2026-02-15T00:00:00Z'),
        new Date('2026-02-10T00:00:00Z'),
      ),
    ).toBe(false);
  });

  it('não expirou no próprio dia do vencimento — só depois', () => {
    expect(
      isQuoteValidityExpired(
        new Date('2026-02-15T00:00:00Z'),
        new Date('2026-02-15T00:00:00Z'),
      ),
    ).toBe(false);
  });

  it('expirou quando a referência é posterior ao vencimento', () => {
    expect(
      isQuoteValidityExpired(
        new Date('2026-02-15T00:00:00Z'),
        new Date('2026-02-16T00:00:00Z'),
      ),
    ).toBe(true);
  });
});
