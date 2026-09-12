// Placeholder deliberado (unidade "papéis e permissões", item 5) —
// mesmo critério de home.tsx antes da D-054: a tela de configuração do
// tenant é "a próxima unidade" (fora de escopo aqui), mas a permissão
// (settings.view) e o item de menu que ela esconde/mostra precisam
// existir JÁ, pra "entre como gestor, confirme que configuração
// aparece" ter alguma coisa concreta pra aparecer.
export function TenantSettingsPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">Configuração</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Nenhuma tela de configuração existe ainda — a próxima unidade
        constrói isso.
      </p>
    </div>
  )
}
