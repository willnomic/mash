import { useQuery } from '@tanstack/react-query'
import type { PermissionCode } from '@mash/shared'
import { api } from '@/lib/api-client'

// Espelha o que GET /me devolve (backend/src/me/me.controller.ts) —
// dados do usuário logado, nunca o token (D-048: o frontend não vê o
// cookie, só sabe "autenticado ou não" + estes dados).
//
// isAdmin/permissions (unidade "papéis e permissões"): já vêm
// RESOLVIDOS pelo backend — isAdmin=true já aparece como a lista
// COMPLETA de códigos, não um caso especial que cada componente
// precisaria checar separado (item 5: a casca esconde, não decide de
// novo a regra que o backend já decidiu).
export interface SessionUser {
  id: string
  name: string
  email: string
  role: string
  isAdmin: boolean
  permissions: PermissionCode[]
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

// A casca esconde, não decide de novo (unidade "papéis e permissões",
// item 5) — só consulta a lista já resolvida por GET /me. Enquanto a
// sessão ainda carrega, `hasPermission` devolve false: nada aparece
// achando que tem permissão pra depois sumir quando o dado chegar
// (D-049, "nada que já apareceu pode se mover").
export function usePermissions() {
  const session = useSession()
  const permissions = session.data?.permissions ?? []

  return {
    isLoading: session.isLoading,
    hasPermission: (code: PermissionCode) => permissions.includes(code),
  }
}
