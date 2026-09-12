import { describe, expect, it } from 'vitest';
import { updateTenantSettingsSchema } from './update-tenant-settings.schema.js';

describe('updateTenantSettingsSchema', () => {
  it('aceita prazo padrão como termo', () => {
    expect(
      updateTenantSettingsSchema.safeParse({
        defaultQuoteValidity: {
          type: 'TERM',
          term: { unit: 'MONTHS', amount: 3 },
        },
      }).success,
    ).toBe(true);
  });

  it('aceita "não vence" como decisão explícita', () => {
    expect(
      updateTenantSettingsSchema.safeParse({
        defaultQuoteValidity: { type: 'NEVER' },
      }).success,
    ).toBe(true);
  });

  it('recusa corpo sem defaultQuoteValidity — não existe "deixar como está" neste contrato', () => {
    expect(updateTenantSettingsSchema.safeParse({}).success).toBe(false);
  });
});
