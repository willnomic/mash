import { Injectable } from '@nestjs/common';

// Consulta de CNPJ (unidade "criar cliente sem sair do fluxo") — AUXÍLIO,
// nunca requisito: qualquer falha (timeout, fora do ar, não encontrado)
// devolve `found: false` com o motivo em português, nunca lança —
// quem chama (PartyController) NUNCA bloqueia a criação por causa
// disto, só o texto na tela ("mostre que não veio e deixe digitar").
//
// Provedor: BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/{cnpj}) —
// pública, sem chave, mantida por terceiros de boa reputação no
// ecossistema Node/BR. Verificado nesta sessão contra a API real: 200
// com o corpo completo pra CNPJ existente, 404 com
// {message,type,name} pra CNPJ inexistente. Campos vêm como string
// vazia quando a Receita não tem o dado (não null/ausente) — por isso
// o endereço só é considerado "completo" com truthy check, não só
// "existe a chave".
export interface CnpjLookupAddress {
  logradouro: string;
  numero?: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface CnpjLookupResult {
  found: boolean;
  name?: string;
  address?: CnpjLookupAddress;
  reason?: string;
}

interface BrasilApiCnpjResponse {
  razao_social?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string | number;
}

const TIMEOUT_MS = 5000;
const BASE_URL = 'https://brasilapi.com.br/api/cnpj/v1';

@Injectable()
export class CnpjLookupService {
  async lookup(cnpjDigits: string): Promise<CnpjLookupResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${BASE_URL}/${cnpjDigits}`, {
        signal: controller.signal,
      });

      if (response.status === 404) {
        return { found: false, reason: 'CNPJ não encontrado na Receita.' };
      }
      if (!response.ok) {
        return {
          found: false,
          reason: `Consulta indisponível agora (BrasilAPI respondeu ${response.status}) — preencha à mão.`,
        };
      }

      const data = (await response.json()) as BrasilApiCnpjResponse;
      const hasFullAddress = Boolean(
        data.logradouro && data.bairro && data.municipio && data.uf && data.cep,
      );

      return {
        found: true,
        name: data.razao_social || undefined,
        address: hasFullAddress
          ? {
              logradouro: data.logradouro as string,
              numero: data.numero || undefined,
              complemento: data.complemento || undefined,
              bairro: data.bairro as string,
              municipio: data.municipio as string,
              uf: data.uf as string,
              cep: String(data.cep),
            }
          : undefined,
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';
      return {
        found: false,
        reason: timedOut
          ? 'Consulta demorou mais de 5s — preencha à mão.'
          : 'Consulta indisponível agora — preencha à mão.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
