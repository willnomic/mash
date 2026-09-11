import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreatePartyInput } from '@mash/shared'
import { api } from '@/lib/api-client'

export interface CreatedParty {
  id: string
  name: string
  cnpj: string | null
}

// Espelha POST /parties (backend/src/party/party.controller.ts) — cria
// pelo modal (unidade "criar cliente sem sair do fluxo"). Invalida a
// lista pra qualquer combobox aberto na mesma tela já enxergar a parte
// nova, mesmo que não tenha sido ele quem abriu o modal.
export function useCreateParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePartyInput) =>
      api.post<CreatedParty>('/parties', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}
