import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { LoginInput } from '@mash/shared'
import { api } from '@/lib/api-client'

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: LoginInput) => api.post<void>('/auth/login', input),
    onSuccess: () => {
      // Login troca a sessão — a próxima leitura de /me precisa ser real,
      // nunca o cache de um usuário anterior (ou de nenhum usuário).
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => {
      queryClient.setQueryData(['me'], undefined)
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
