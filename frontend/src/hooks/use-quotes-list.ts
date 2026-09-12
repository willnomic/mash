import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ListQuotesQuery } from '@mash/shared'
import { api } from '@/lib/api-client'

// Espelha o corpo por linha de GET /quotes/:id (backend/src/quote/quote.controller.ts)
// — mesmos nomes de campo, só os que fazem sentido numa linha de lista
// (unidade "lista de cotações", item "reaproveitar a forma, não
// inventar outra").
export interface QuoteListItem {
  id: string
  createdAt: string
  statusCode: 'OPEN' | 'CLOSED' | 'ACCEPTED' | 'REJECTED'
  isExpired: boolean
  validUntil: string | null
  party: { id: string; name: string }
  total: string | null
}

// Envelope escolhido nesta unidade (a D-051 dizia ter deixado GET
// /parties/GET /branches "prontos pra paginação sem mudança de
// contrato", mas os dois devolvem array bruto — não sustentava a
// alegação, achado relatado antes de codar). {items, total, page,
// pageSize}: aditivo por construção, um campo novo depois não quebra
// quem já lê `items`/`total`.
export interface QuoteListResponse {
  items: QuoteListItem[]
  total: number
  page: number
  pageSize: number
}

function buildQueryString(query: ListQuotesQuery): string {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.partyId) params.set('partyId', query.partyId)
  if (query.q) params.set('q', query.q)
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  return params.toString()
}

// Mesmo endpoint alimenta a tela de lista E o Ctrl+K (item 7 do pedido)
// — quem chama passa pageSize pequeno e só `q` pra busca de entidade,
// sem endpoint novo.
export function useQuotesList(query: ListQuotesQuery) {
  return useQuery({
    queryKey: ['quotes', query],
    queryFn: () => api.get<QuoteListResponse>(`/quotes?${buildQueryString(query)}`),
    // Mantém a página anterior visível enquanto a próxima carrega — sem
    // isso, trocar de página ou filtro pisca esqueleto por cima de uma
    // tabela que já tinha dado (D-049: nada que já apareceu pode se
    // mover/sumir à toa).
    placeholderData: keepPreviousData,
  })
}
