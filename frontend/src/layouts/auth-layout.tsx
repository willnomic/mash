import type { ReactNode } from 'react'

// Layout de autenticação (D-022, item 3): sem sidebar, sem Ctrl+K, sem
// arte/gradiente/animação. O operador loga uma vez por dia e quer sair
// dali em três segundos — nada aqui compete por atenção com o
// formulário.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
        {children}
      </div>
    </div>
  )
}
