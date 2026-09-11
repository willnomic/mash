import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Espelha GET /branches (backend/src/branch/branch.controller.ts) —
// leitura simples pra popular o seletor de filial no aceite (D-047).
// D-011 deliberadamente não construiu tela de filial no MVP; isto não
// é essa tela.
export interface BranchOption {
  id: string
  name: string
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchOption[]>('/branches'),
    staleTime: 5 * 60 * 1000,
  })
}
