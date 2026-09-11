// Registro central de atalhos (D-022/item 10) — o Ctrl+K lê daqui, e
// qualquer tooltip que mencione atalho deveria ler do mesmo lugar, não
// duplicar o texto. NESTA UNIDADE só navegação entre telas: busca de
// entidade (número de cotação, CNPJ, placa, motorista) entra junto do
// endpoint de busca de cada tela ("o endpoint nasce com a tela", D-048)
// — não construído aqui.
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
