import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateBranchInput } from '@mash/shared'
import { api } from '@/lib/api-client'

export interface CreatedBranch {
  id: string
  name: string
}

// Espelha POST /branches — mesmo tratamento de useCreateParty.
export function useCreateBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBranchInput) =>
      api.post<CreatedBranch>('/branches', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['branches'] })
    },
  })
}
