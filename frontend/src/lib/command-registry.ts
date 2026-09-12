// Registro central de atalhos (D-022/item 10) — o Ctrl+K lê daqui, e
// qualquer tooltip que mencione atalho deveria ler do mesmo lugar, não
// duplicar o texto. Só navegação entre telas — busca de entidade
// (cotação por cliente, unidade "lista de cotações") mora direto em
// command-palette.tsx, reaproveitando GET /quotes, não este registro.
export interface CommandEntry {
  id: string
  label: string
  to: string
}

export const navigationCommands: CommandEntry[] = [
  { id: 'home', label: 'Início', to: '/' },
  {
    id: 'quote-cost-based',
    label: 'Cotação por custo (nova)',
    to: '/cotacoes/nova-por-custo',
  },
]
