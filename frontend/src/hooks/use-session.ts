import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Espelha o que GET /me devolve (backend/src/me/me.controller.ts) —
// dados do usuário logado, nunca o token (D-048: o frontend não vê o
// cookie, só sabe "autenticado ou não" + estes dados).
export interface SessionUser {
  id: string
  name: string
  email: string
  role: string
  tenant: {
    id: string
    name: string
    slug: string
  }
}

// retry:false — 401 não deve tentar de novo (não tem sessão pra
// "aparecer" numa segunda tentativa); staleTime alto porque a sessão só
// muda por login/logout, ambos já invalidam esta query explicitamente.
export function useSession() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<SessionUser>('/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
