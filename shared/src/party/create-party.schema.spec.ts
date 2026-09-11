import { describe, expect, it } from 'vitest';
import { createPartySchema } from './create-party.schema.js';

describe('createPartySchema', () => {
  const validAddress = {
    logradouro: 'Rua A',
    bairro: 'Centro',
    municipio: 'São Paulo',
    uf: 'SP',
    cep: '01000-000',
  };

  it('aceita nome + CNPJ válido, sem endereço', () => {
    const result = createPartySchema.safeParse({
      name: 'Cliente Teste',
      cnpj: '11444777000161',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.address).toBeUndefined();
  });

  it('aceita CNPJ com pontuação, normaliza pros 14 dígitos', () => {
    const result = createPartySchema.safeParse({
      name: 'Cliente Teste',
      cnpj: '11.444.777/0001-61',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.cnpj).toBe('11444777000161');
  });

  it('recusa CNPJ com dígito verificador errado', () => {
    const result = createPartySchema.safeParse({
      name: 'Cliente Teste',
      cnpj: '11444777000162',
    });
    expect(result.success).toBe(false);
  });

  it('recusa nome vazio', () => {
    const result = createPartySchema.safeParse({
      name: '',
      cnpj: '11444777000161',
    });
    expect(result.success).toBe(false);
  });

  it('aceita endereço completo, normaliza CEP com pontuação', () => {
    const result = createPartySchema.safeParse({
      name: 'Cliente Teste',
      cnpj: '11444777000161',
      address: validAddress,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.address?.cep).toBe('01000000');
  });

  it('recusa endereço faltando um campo obrigatório (bairro) — não aceita parcial', () => {
    const { bairro: _bairro, ...withoutBairro } = validAddress;
    const result = createPartySchema.safeParse({
      name: 'Cliente Teste',
      cnpj: '11444777000161',
      address: withoutBairro,
    });
    expect(result.success).toBe(false);
  });

  it('numero/complemento vazios normalizam pra undefined (mesmo achado da descrição da linha de custo)', () => {
    const result = createPartySchema.safeParse({
      name: 'Cliente Teste',
      cnpj: '11444777000161',
      address: { ...validAddress, numero: '', complemento: '' },
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.address?.numero).toBeUndefined();
    expect(result.success && result.data.address?.complemento).toBeUndefined();
  });
});
