import { afterEach, describe, expect, it, vi } from 'vitest';
import { CnpjLookupService } from './cnpj-lookup.service.js';

// Unitário — sem banco, sem rede real: `fetch` global mockado por
// caso, pra cobrir os caminhos de falha (não encontrado, indisponível,
// timeout) de forma determinística, sem depender da BrasilAPI estar no
// ar a cada rodada de teste. O caminho de sucesso contra a API REAL foi
// verificado nesta sessão via curl (CNPJ 11444777000161) e é reexercido
// no navegador (unidade "criar cliente sem sair do fluxo").
describe('CnpjLookupService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('CNPJ não encontrado (404): found=false com motivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false }),
    );
    const result = await new CnpjLookupService().lookup('11444777000161');
    expect(result.found).toBe(false);
    expect(result.reason).toMatch(/não encontrado/);
  });

  it('BrasilAPI fora do ar (500): found=false, nunca lança', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 500, ok: false }),
    );
    const result = await new CnpjLookupService().lookup('11444777000161');
    expect(result.found).toBe(false);
    expect(result.reason).toMatch(/indisponível/);
  });

  it('erro de rede (fetch rejeita): found=false, nunca lança', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await new CnpjLookupService().lookup('11444777000161');
    expect(result.found).toBe(false);
    expect(result.reason).toMatch(/indisponível/);
  });

  it('timeout (AbortError): found=false, motivo menciona o limite de tempo', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    const result = await new CnpjLookupService().lookup('11444777000161');
    expect(result.found).toBe(false);
    expect(result.reason).toMatch(/5s/);
  });

  it('encontrado com endereço completo: found=true, address preenchido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          razao_social: 'Cliente Teste LTDA',
          logradouro: 'Rua A',
          numero: '100',
          complemento: '',
          bairro: 'Centro',
          municipio: 'São Paulo',
          uf: 'SP',
          cep: '01000000',
        }),
      }),
    );
    const result = await new CnpjLookupService().lookup('11444777000161');
    expect(result.found).toBe(true);
    expect(result.name).toBe('Cliente Teste LTDA');
    expect(result.address).toEqual({
      logradouro: 'Rua A',
      numero: '100',
      complemento: undefined,
      bairro: 'Centro',
      municipio: 'São Paulo',
      uf: 'SP',
      cep: '01000000',
    });
  });

  it('encontrado mas com logradouro vazio (Receita sem o dado): address vem undefined, nunca parcial', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          razao_social: 'Z R DE BRITO EMPREITEIRA',
          logradouro: '',
          numero: '',
          complemento: '',
          bairro: 'VILA OLIVEIRA',
          municipio: 'JARDINOPOLIS',
          uf: 'SP',
          cep: '14680000',
        }),
      }),
    );
    const result = await new CnpjLookupService().lookup('11444777000161');
    expect(result.found).toBe(true);
    expect(result.name).toBe('Z R DE BRITO EMPREITEIRA');
    expect(result.address).toBeUndefined();
  });
});
