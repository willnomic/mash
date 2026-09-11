import { describe, expect, it } from 'vitest';
import { acceptQuoteSchema } from './accept-quote.schema.js';

const validUuid = '01950000-0000-7000-8000-000000000001';

describe('acceptQuoteSchema', () => {
  const base = {
    branchId: validUuid,
    senderId: validUuid,
    recipientId: validUuid,
    tomadorId: validUuid,
  };

  it('aceita os quatro campos obrigatórios', () => {
    expect(acceptQuoteSchema.safeParse(base).success).toBe(true);
  });

  it('recusa qualquer um dos quatro ausente ou inválido', () => {
    for (const field of [
      'branchId',
      'senderId',
      'recipientId',
      'tomadorId',
    ] as const) {
      expect(
        acceptQuoteSchema.safeParse({ ...base, [field]: undefined }).success,
      ).toBe(false);
      expect(
        acceptQuoteSchema.safeParse({ ...base, [field]: 'não-é-uuid' })
          .success,
      ).toBe(false);
    }
  });

  it('customerReference vazio ou só espaço normaliza pra undefined', () => {
    const empty = acceptQuoteSchema.safeParse({
      ...base,
      customerReference: '',
    });
    expect(empty.success).toBe(true);
    expect(empty.success && empty.data.customerReference).toBeUndefined();

    const whitespace = acceptQuoteSchema.safeParse({
      ...base,
      customerReference: '   ',
    });
    expect(whitespace.success).toBe(true);
    expect(
      whitespace.success && whitespace.data.customerReference,
    ).toBeUndefined();
  });

  it('customerReference preenchida é aceita e aparada', () => {
    const result = acceptQuoteSchema.safeParse({
      ...base,
      customerReference: '  PRA 7497/24  ',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.customerReference).toBe(
      'PRA 7497/24',
    );
  });
});
