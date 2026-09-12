import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { navigationCommands } from '@/lib/command-registry'
import { useQuotesList } from '@/hooks/use-quotes-list'
import { formatDecimalBRL } from '@/lib/br-number'

// Busca de entidade no Ctrl+K (D-048: "busca entidade, não só tela";
// D-049 deixou só navegação porque não existia endpoint de busca —
// agora existe, unidade "lista de cotações"). Reaproveita o MESMO
// endpoint da lista (GET /quotes?q=...), sem endpoint novo — só um
// pageSize pequeno.
//
// shouldFilter={false} na raiz: com resultado de servidor chegando pro
// grupo "Cotações", o filtro embutido do cmdk (que só sabe comparar
// texto local) faria mais mal que bem — filtramos "Telas" à mão embaixo
// pra manter o mesmo comportamento de antes.
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  const quotes = useQuotesList({
    q: debounced || undefined,
    page: 1,
    pageSize: 5,
  })

  const filteredScreens = navigationCommands.filter((entry) =>
    entry.label.toLowerCase().includes(search.trim().toLowerCase()),
  )

  // Reseta a busca ao FECHAR (por seleção, Esc ou clique fora) — no
  // handler do fechamento, não em efeito: já reabre em branco na
  // próxima vez, sem precisar sincronizar com `open` depois de montado.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setSearch('')
      setDebounced('')
    }
    onOpenChange(next)
  }

  function goToQuote(id: string) {
    handleOpenChange(false)
    void navigate({ to: '/cotacoes/$id', params: { id } })
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Navegar"
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Ir para, ou buscar cotação por cliente..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {filteredScreens.length === 0 && !debounced && (
          <CommandEmpty>Nada encontrado.</CommandEmpty>
        )}
        <CommandGroup heading="Telas">
          {filteredScreens.map((entry) => (
            <CommandItem
              key={entry.id}
              value={entry.label}
              onSelect={() => {
                handleOpenChange(false)
                void navigate({ to: entry.to })
              }}
            >
              {entry.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {debounced && (
          <CommandGroup heading="Cotações">
            {quotes.isLoading && (
              <CommandItem disabled value="carregando">
                Buscando...
              </CommandItem>
            )}
            {!quotes.isLoading && quotes.data?.items.length === 0 && (
              <CommandItem disabled value="nada">
                Nenhuma cotação encontrada.
              </CommandItem>
            )}
            {quotes.data?.items.map((quote) => (
              <CommandItem
                key={quote.id}
                value={quote.id}
                onSelect={() => goToQuote(quote.id)}
              >
                {quote.party.name}
                {quote.total ? ` — R$ ${formatDecimalBRL(quote.total)}` : ''}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
