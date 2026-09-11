import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Espelha GET /parties/cnpj/:cnpj — AUXÍLIO, nunca requisito (unidade
// "criar cliente sem sair do fluxo"): mutation, não query, porque só
// dispara sob ação do operador (ao sair do campo CNPJ), não
// automaticamente a cada keystroke.
export interface CnpjLookupResponse {
  found: boolean
  name?: string
  address?: {
    logradouro: string
    numero?: string
    complemento?: string
    bairro: string
    municipio: string
    uf: string
    cep: string
  }
  reason?: string
}

export function useCnpjLookup() {
  return useMutation({
    mutationFn: (cnpjDigits: string) =>
      api.get<CnpjLookupResponse>(`/parties/cnpj/${cnpjDigits}`),
  })
}
