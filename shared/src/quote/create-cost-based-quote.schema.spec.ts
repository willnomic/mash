import { describe, expect, it } from 'vitest';
import {
  createCostBasedQuoteSchema,
  quoteCostLineInputSchema,
} from './create-cost-based-quote.schema.js';

const validLine = {
  costTypeId: '01950000-0000-7000-8000-000000000001',
  amount: '400.00',
};

describe('quoteCostLineInputSchema', () => {
  it('aceita valor com até duas casas decimais', () => {
    expect(quoteCostLineInputSchema.safeParse(validLine).success).toBe(true);
    expect(
      quoteCostLineInputSchema.safeParse({ ...validLine, amount: '400' })
        .success,
    ).toBe(true);
  });

  it('recusa valor com três casas decimais, vírgula, ou negativo', () => {
    expect(
      quoteCostLineInputSchema.safeParse({ ...validLine, amount: '400.123' })
        .success,
    ).toBe(false);
    expect(
      quoteCostLineInputSchema.safeParse({ ...validLine, amount: '400,00' })
        .success,
    ).toBe(false);
    expect(
      quoteCostLineInputSchema.safeParse({ ...validLine, amount: '-400' })
        .success,
    ).toBe(false);
  });

  it('recusa valor zero — custo zero não é custo', () => {
    expect(
      quoteCostLineInputSchema.safeParse({ ...validLine, amount: '0' })
        .success,
    ).toBe(false);
  });

  it('recusa costTypeId que não é uuid', () => {
    expect(
      quoteCostLineInputSchema.safeParse({ ...validLine, costTypeId: 'x' })
        .success,
    ).toBe(false);
  });

  it('descrição vazia ou só espaço é aceita e normalizada pra undefined (achado de teste real no navegador: campo de formulário vazio manda "", não undefined)', () => {
    const empty = quoteCostLineInputSchema.safeParse({
      ...validLine,
      description: '',
    });
    expect(empty.success).toBe(true);
    expect(empty.success && empty.data.description).toBeUndefined();

    const whitespace = quoteCostLineInputSchema.safeParse({
      ...validLine,
      description: '   ',
    });
    expect(whitespace.success).toBe(true);
    expect(whitespace.success && whitespace.data.description).toBeUndefined();
  });

  it('descrição preenchida é aceita e aparada', () => {
    const result = quoteCostLineInputSchema.safeParse({
      ...validLine,
      description: '  Frete do terceiro  ',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.description).toBe(
      'Frete do terceiro',
    );
  });
});

describe('createCostBasedQuoteSchema', () => {
  const base = {
    partyId: '01950000-0000-7000-8000-000000000099',
    icmsUf: 'SP',
    marginPercentage: '20',
    costLines: [validLine],
  };

  it('aceita entrada válida', () => {
    expect(createCostBasedQuoteSchema.safeParse(base).success).toBe(true);
  });

  it('recusa sem partyId — quem pediu a cotação é obrigatório (unidade "vincular cliente à Quote")', () => {
    const { partyId: _partyId, ...withoutParty } = base;
    expect(createCostBasedQuoteSchema.safeParse(withoutParty).success).toBe(
      false,
    );
  });

  it('recusa partyId que não é uuid', () => {
    expect(
      createCostBasedQuoteSchema.safeParse({ ...base, partyId: 'x' }).success,
    ).toBe(false);
  });

  it('recusa UF que não existe', () => {
    expect(
      createCostBasedQuoteSchema.safeParse({ ...base, icmsUf: 'XX' })
        .success,
    ).toBe(false);
  });

  it('recusa margem >= 100 — divide o preço final por zero (D-041)', () => {
    expect(
      createCostBasedQuoteSchema.safeParse({
        ...base,
        marginPercentage: '100',
      }).success,
    ).toBe(false);
    expect(
      createCostBasedQuoteSchema.safeParse({
        ...base,
        marginPercentage: '150',
      }).success,
    ).toBe(false);
  });

  it('aceita margem com até quatro casas decimais, recusa a quinta', () => {
    expect(
      createCostBasedQuoteSchema.safeParse({
        ...base,
        marginPercentage: '20.1234',
      }).success,
    ).toBe(true);
    expect(
      createCostBasedQuoteSchema.safeParse({
        ...base,
        marginPercentage: '20.12345',
      }).success,
    ).toBe(false);
  });

  it('recusa lista de custo vazia', () => {
    expect(
      createCostBasedQuoteSchema.safeParse({ ...base, costLines: [] })
        .success,
    ).toBe(false);
  });
});
