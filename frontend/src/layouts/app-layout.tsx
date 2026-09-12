import { useEffect } from 'react'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import { useLogout } from '@/hooks/use-auth'
import { useCommandPaletteState } from '@/hooks/use-command-palette'
import { CommandPalette } from '@/components/command-palette'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// Layout de aplicação (item 3): sidebar + cabeçalho + área de conteúdo.
// Larguras/alturas fixas (não dependem do dado carregado) — nada que já
// apareceu na tela pode se mover depois (item 7): o espaço do nome do
// usuário, por exemplo, é reservado com um esqueleto do MESMO tamanho
// que o texto real vai ocupar, não um espaço vazio que cresce quando o
// nome chega.
//
// A casca (esta função) sempre renderiza — sidebar, cabeçalho, área de
// conteúdo aparecem desenhados na hora, com esqueleto no formato do que
// está vindo (item 6). NUNCA tela branca, nunca conteúdo real piscando
// antes de saber se a sessão existe.
export function AppLayout() {
  const { data: user, isLoading, isError } = useSession()
  const navigate = useNavigate()
  const logout = useLogout()
  const commandPalette = useCommandPaletteState()

  useEffect(() => {
    if (isError) {
      void navigate({ to: '/login' })
    }
  }, [isError, navigate])

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card p-3">
        <div className="px-2 py-2 text-sm font-semibold text-foreground">
          Mash
        </div>
        <nav className="mt-2 flex flex-col gap-1">
          {isLoading || !user ? (
            // Esqueleto no formato do menu (D-049, item 6) — nunca
            // ausência súbita nem item aparecendo e sumindo quando a
            // permissão chega (unidade "papéis e permissões", item 5).
            <>
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </>
          ) : (
            <>
              {user.permissions.includes('quote.view') && (
                <a
                  href="/"
                  className="rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
                >
                  Início
                </a>
              )}
              {user.permissions.includes('quote.create') && (
                <a
                  href="/cotacoes/nova-por-custo"
                  className="rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
                >
                  Cotação por custo
                </a>
              )}
              {user.permissions.includes('settings.view') && (
                <a
                  href="/configuracoes"
                  className="rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
                >
                  Configuração
                </a>
              )}
            </>
          )}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground"
            onClick={() => commandPalette.setOpen(true)}
          >
            <Search className="size-3.5" />
            Buscar
            <kbd className="ml-2 rounded border border-border px-1 text-xs">
              Ctrl+K
            </kbd>
          </Button>

          <div className="flex items-center gap-3">
            {isLoading || !user ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <span className="text-sm text-muted-foreground">
                {user.tenant.name} · {user.name}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading || logout.isPending}
              onClick={() => {
                logout.mutate(undefined, {
                  onSuccess: () => void navigate({ to: '/login' }),
                })
              }}
            >
              Sair
            </Button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : user ? (
            <Outlet />
          ) : null}
        </main>
      </div>

      <CommandPalette
        open={commandPalette.open}
        onOpenChange={commandPalette.setOpen}
      />
    </div>
  )
}
