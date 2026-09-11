import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { QuoteCostBasedFormOutput } from '@/lib/quote-cost-based-form.schema'

export interface CreatedQuote {
  id: string
  createdAt: string
}

// Espelha POST /quotes/cost-based — cria o rascunho (OPEN), guardando só
// as entradas (linhas de custo, margem, UF). Fora de escopo: lista de
// cotações, então não há query de lista pra invalidar aqui (D-048/item
// 6 seria "o endpoint nasce com a tela" — não existe tela de lista
// ainda).
export function useCreateCostBasedQuote() {
  return useMutation({
    mutationFn: (input: QuoteCostBasedFormOutput) =>
      api.post<CreatedQuote>('/quotes/cost-based', input),
  })
}
