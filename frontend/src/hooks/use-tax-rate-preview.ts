import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Espelha GET /tax-rates/quote-preview (backend/src/tax-rate/tax-rate.controller.ts)
// — mesmas três buscas que QuoteService.close() faz de verdade no
// fechamento (D-041/D-043), só pra preview. Se a alíquota não estiver
// disponível (placeholder fora de dev/test, ou UF sem vigência), a rota
// devolve 422 com o motivo — nunca zero, nunca valor inventado (D-048).
export interface QuoteRatesPreview {
  icmsRatePercent: string
  ibsRatePercent: string
  ibsComposesPrice: boolean
  cbsRatePercent: string
  cbsComposesPrice: boolean
}

export function useTaxRatePreview(icmsUf: string | undefined) {
  return useQuery({
    queryKey: ['tax-rates', 'quote-preview', icmsUf],
    queryFn: () =>
      api.get<QuoteRatesPreview>(
        `/tax-rates/quote-preview?icmsUf=${encodeURIComponent(icmsUf ?? '')}`,
      ),
    enabled: Boolean(icmsUf),
    // Erro de alíquota indisponível é de negócio, não de rede — tentar
    // de novo não resolve (item 5 do cliente HTTP/main.tsx: só falha de
    // rede genuína vale retry).
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
