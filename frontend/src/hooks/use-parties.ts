import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Espelha GET /parties (backend/src/party/party.controller.ts) — leitura
// simples pra popular seletor (remetente/destinatário/tomador, D-047).
// Sem cadastro/criação aqui — isso é modelagem que ainda não existe.
export interface PartyOption {
  id: string
  name: string
  cnpj: string | null
  cpf: string | null
}

export function useParties() {
  return useQuery({
    queryKey: ['parties'],
    queryFn: () => api.get<PartyOption[]>('/parties'),
    staleTime: 5 * 60 * 1000,
  })
}
