import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Espelha GET /quote-cost-types (backend/src/quote/quote-cost-type.controller.ts)
// — tabela de domínio (D-020), lida do banco, nunca chumbada na tela.
export interface QuoteCostTypeOption {
  id: string
  code: string
  name: string
}

export function useQuoteCostTypes() {
  return useQuery({
    queryKey: ['quote-cost-types'],
    queryFn: () => api.get<QuoteCostTypeOption[]>('/quote-cost-types'),
    // Lista de domínio muda por INSERT do operador (D-020), não a cada
    // segundo — staleTime alto evita refetch a cada linha adicionada na
    // tela sem perder atualização (invalidação futura, quando existir
    // tela de cadastro de tipo, faria o refetch de verdade).
    staleTime: 5 * 60 * 1000,
  })
}
