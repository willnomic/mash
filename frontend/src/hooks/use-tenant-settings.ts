import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QuoteValidityDecision, UpdateTenantSettingsInput } from '@mash/shared'
import { api } from '@/lib/api-client'

// Espelha GET/POST /tenant-settings (backend/src/tenant-settings/
// tenant-settings.controller.ts) — tela de gerenciar a configuração,
// atrás de settings.view/settings.change. Não é o mesmo caminho que
// pré-enche o fechamento de cotação (esse lê de GET /me, sem exigir
// permissão — ver use-session.ts): esta tela é para QUEM CONFIGURA, não
// para todo mundo que fecha cotação.
export interface TenantSettingsResponse {
  defaultQuoteValidity: QuoteValidityDecision | null
}

export function useTenantSettings() {
  return useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get<TenantSettingsResponse>('/tenant-settings'),
  })
}

export function useUpdateTenantSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateTenantSettingsInput) =>
      api.post<TenantSettingsResponse>('/tenant-settings', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['tenant-settings'], data)
      // O valor pré-enchido no fechamento de cotação vem de GET /me
      // (use-session.ts) — invalida pra próxima leitura já trazer o
      // padrão recém-salvo, sem esperar o staleTime de 5min vencer.
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
