import { useSession } from '@/hooks/use-session'

// Placeholder deliberado — esta unidade é a casca, não a primeira tela
// de negócio (nenhuma tela de cotação foi construída aqui). Só prova
// que o layout de aplicação mostra conteúdo real depois que a sessão
// resolve.
export function HomePage() {
  const { data: user } = useSession()

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">
        Bem-vindo{user ? `, ${user.name}` : ''}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Nenhuma tela de negócio existe ainda — esta é a casca do frontend.
      </p>
    </div>
  )
}
