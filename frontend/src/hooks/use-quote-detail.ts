import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AcceptQuoteInput } from '@mash/shared'
import { api } from '@/lib/api-client'

// Espelha o corpo que QuoteController.findOne()/close()/accept()/
// reject() devolvem (backend/src/quote/quote.controller.ts) — os
// quatro endpoints devolvem a MESMA forma, então um tipo só serve pros
// quatro.
export interface QuoteDetail {
  id: string
  createdAt: string
  statusCode: 'OPEN' | 'CLOSED' | 'ACCEPTED' | 'REJECTED'
  isExpired: boolean
  validUntil: string | null
  icmsUf: string | null
  marginPercentage: string | null
  icmsRateApplied: string | null
  ibsRateApplied: string | null
  cbsRateApplied: string | null
  total: string | null
  quantity: number
  costSubtotal: string
  costLines: {
    id: string
    costTypeName: string
    description: string | null
    amount: string
  }[]
  order: {
    id: string
    number: number
    tripsCount: number
    unitPrice: string
  } | null
}

export interface ValidityTermInput {
  unit: 'DAYS' | 'MONTHS'
  amount: number
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: ['quote', id],
    queryFn: () => api.get<QuoteDetail>(`/quotes/${id}`),
  })
}

// Fechar/aceitar/recusar são irreversíveis (D-046/D-047/D-049) — as três
// mutações escrevem o resultado direto no cache da query (a resposta já
// é o novo estado completo, mesma forma de GET /quotes/:id), em vez de
// só invalidar e esperar um refetch: a tela não pode "voltar" a mostrar
// o estado antigo por um instante entre a resposta e o refetch.
export function useCloseQuote(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (validityTerm: ValidityTermInput) =>
      api.post<QuoteDetail>(`/quotes/${id}/close`, { validityTerm }),
    onSuccess: (data) => {
      queryClient.setQueryData(['quote', id], data)
    },
  })
}

export function useAcceptQuote(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AcceptQuoteInput) =>
      api.post<QuoteDetail>(`/quotes/${id}/accept`, input),
    onSuccess: (data) => {
      queryClient.setQueryData(['quote', id], data)
    },
  })
}

export function useRejectQuote(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<QuoteDetail>(`/quotes/${id}/reject`),
    onSuccess: (data) => {
      queryClient.setQueryData(['quote', id], data)
    },
  })
}
