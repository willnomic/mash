import { describe, expect, it } from 'vitest';
import { isValidCnpj, onlyDigits } from './cnpj.js';

describe('onlyDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(onlyDigits('11.444.777/0001-61')).toBe('11444777000161');
  });
});

describe('isValidCnpj', () => {
  it('aceita o CNPJ real já usado em vários testes do backend (freight-rate-validity, quote-cost-based etc.)', () => {
    expect(isValidCnpj('11444777000161')).toBe(true);
  });

  it('aceita com pontuação — o dígito verificador olha só os números', () => {
    expect(isValidCnpj('11.444.777/0001-61')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(isValidCnpj('11444777000162')).toBe(false);
  });

  it('recusa tamanho errado', () => {
    expect(isValidCnpj('1144477700016')).toBe(false);
    expect(isValidCnpj('114447770001611')).toBe(false);
  });

  it('recusa todos os dígitos iguais (passa no mod 11, não é CNPJ real)', () => {
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('recusa vazio', () => {
    expect(isValidCnpj('')).toBe(false);
  });
});
