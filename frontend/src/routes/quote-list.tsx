import { useEffect, useRef, useState } from 'react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  QUOTE_LIST_STATUS_FILTERS,
  type QuoteListStatusFilter,
} from '@mash/shared'
import { useQuotesList, type QuoteListItem } from '@/hooks/use-quotes-list'
import { useParties } from '@/hooks/use-parties'
import { formatDecimalBRL } from '@/lib/br-number'
import { formatDate } from '@/lib/br-date'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/status-tone'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// Primeira tela de chegada do sistema (unidade "lista de cotações") —
// substitui o placeholder da casca (D-049: "esta unidade é a casca, não
// a primeira tela de negócio"). Primeiro uso real de TanStack Table
// (D-021, nunca exercitado até aqui).
const routeApi = getRouteApi('/app/')

const STATUS_FILTER_LABEL: Record<QuoteListStatusFilter, string> = {
  OPEN: 'Rascunho',
  CLOSED: 'Fechada',
  CLOSED_EXPIRED: 'Fechada e vencida',
  ACCEPTED: 'Aceita',
  REJECTED: 'Recusada',
}

// Mesmo critério de quote-detail.tsx: "vencida" nunca é status próprio,
// é isExpired calculado no backend a cada consulta (D-046).
function statusLabelFor(item: QuoteListItem): { text: string; tone: StatusTone } {
  if (item.statusCode === 'OPEN') return { text: 'Rascunho', tone: 'neutral' }
  if (item.statusCode === 'ACCEPTED') return { text: 'Aceita', tone: 'positive' }
  if (item.statusCode === 'REJECTED') return { text: 'Recusada', tone: 'negative' }
  if (item.isExpired) return { text: 'Vencida', tone: 'negative' }
  return { text: 'Fechada', tone: 'neutral' }
}

const GRID_COLUMNS = '1.6fr 140px 160px 130px 130px'

const columns: ColumnDef<QuoteListItem>[] = [
  {
    id: 'party',
    header: 'Cliente',
    cell: ({ row }) => row.original.party.name,
  },
  {
    id: 'total',
    header: 'Preço final',
    cell: ({ row }) =>
      row.original.total ? `R$ ${formatDecimalBRL(row.original.total)}` : '—',
  },
  {
    id: 'status',
    header: 'Estado',
    cell: ({ row }) => {
      const status = statusLabelFor(row.original)
      return (
        <span className={STATUS_TONE_CLASS[status.tone]}>{status.text}</span>
      )
    },
  },
  {
    id: 'validUntil',
    header: 'Validade',
    cell: ({ row }) => formatDate(row.original.validUntil) ?? '—',
  },
  {
    id: 'createdAt',
    header: 'Criada em',
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
]

export function QuoteListPage() {
  const search = routeApi.useSearch()
  const navigate = useNavigate()
  const parties = useParties()

  const query = {
    status: search.status,
    partyId: search.partyId,
    q: search.q,
    page: search.page,
    pageSize: search.pageSize,
  }
  const quotes = useQuotesList(query)

  const [searchDraft, setSearchDraft] = useState(search.q ?? '')
  useEffect(() => {
    setSearchDraft(search.q ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q])

  // Busca por texto no servidor (item 3) — debounce de 300ms pra não
  // disparar uma requisição por tecla. Muda filtro sempre volta pra
  // page 1 (senão o operador pode cair numa página vazia).
  useEffect(() => {
    const trimmed = searchDraft.trim()
    if (trimmed === (search.q ?? '')) return
    const timer = setTimeout(() => {
      void navigate({
        to: '/',
        search: (prev) => ({
          ...prev,
          q: trimmed || undefined,
          page: 1,
        }),
      })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft])

  const items = quotes.data?.items ?? []
  const total = quotes.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize))

  // Navegação por teclado (D-022): setas movem a linha ativa, Enter
  // abre. Foco inicial vai pro CONTAINER da tabela, não na busca — esta
  // é a primeira tela em que o operador chega sem saber o que quer
  // (item 5); focar a busca ajudaria só quem já sabe o nome do cliente
  // e atrapalharia quem só quer varrer a lista com as setas, que é o
  // caso mais comum ao abrir o sistema pela manhã.
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Volta pro topo da lista sempre que filtro ou página mudam — é uma
  // lista nova, a posição antiga não significa nada nela.
  useEffect(() => {
    setActiveIndex(0)
  }, [query.status, query.partyId, query.q, query.page])

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(items.length - 1, 0)))
  }, [items.length])

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
  })

  function openRow(index: number) {
    const item = items[index]
    if (!item) return
    void navigate({ to: '/cotacoes/$id', params: { id: item.id } })
  }

  function handleContainerKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      openRow(activeIndex)
    }
  }

  function updateSearch(patch: Partial<{ status: QuoteListStatusFilter | undefined; partyId: string | undefined }>) {
    void navigate({
      to: '/',
      search: (prev) => ({ ...prev, ...patch, page: 1 }),
    })
  }

  function goToPage(page: number) {
    void navigate({ to: '/', search: (prev) => ({ ...prev, page }) })
  }

  const isInitialLoading = quotes.isLoading

  return (
    <div className="flex h-full flex-col gap-3">
      <h1 className="text-base font-semibold text-foreground">Cotações</h1>

      <div className="flex items-end gap-3">
        <div className="flex w-64 flex-col gap-1.5">
          <Label htmlFor="quote-search">Buscar por cliente</Label>
          <Input
            id="quote-search"
            type="search"
            placeholder="Nome do cliente..."
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </div>

        <div className="flex w-44 flex-col gap-1.5">
          <Label htmlFor="quote-status-filter">Estado</Label>
          <select
            id="quote-status-filter"
            value={search.status ?? 'CLOSED'}
            onChange={(event) =>
              updateSearch({
                status: event.target.value as QuoteListStatusFilter,
              })
            }
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            style={{ fontSize: 'var(--density-form-font-size)' }}
          >
            {QUOTE_LIST_STATUS_FILTERS.map((code) => (
              <option key={code} value={code}>
                {STATUS_FILTER_LABEL[code]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex w-56 flex-col gap-1.5">
          <Label htmlFor="quote-party-filter">Cliente</Label>
          <select
            id="quote-party-filter"
            value={search.partyId ?? ''}
            onChange={(event) =>
              updateSearch({ partyId: event.target.value || undefined })
            }
            disabled={parties.isLoading}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            style={{ fontSize: 'var(--density-form-font-size)' }}
          >
            <option value="">Todos os clientes</option>
            {parties.data?.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>
        </div>

        {quotes.isFetching && !isInitialLoading && (
          <span className="pb-1.5 text-xs text-muted-foreground">
            Atualizando...
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        role="table"
        aria-label="Cotações"
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <div
          role="row"
          className="grid shrink-0 items-center gap-2 border-b border-border bg-secondary px-3 text-xs font-medium text-muted-foreground"
          style={{ gridTemplateColumns: GRID_COLUMNS, height: 'var(--density-table-row-height)' }}
        >
          {table.getHeaderGroups()[0].headers.map((header) => (
            <span
              key={header.id}
              role="columnheader"
              className={header.column.id === 'total' ? 'text-right' : undefined}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isInitialLoading &&
            Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="grid items-center gap-2 border-b border-border px-3"
                style={{ gridTemplateColumns: GRID_COLUMNS, height: 'var(--density-table-row-height)' }}
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="ml-auto h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}

          {!isInitialLoading && items.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma cotação encontrada.
            </p>
          )}

          {!isInitialLoading &&
            table.getRowModel().rows.map((row, index) => (
              <div
                key={row.id}
                role="row"
                aria-selected={index === activeIndex}
                onClick={() => openRow(index)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`grid cursor-pointer items-center gap-2 border-b border-border px-3 text-sm tabular-nums ${
                  index === activeIndex ? 'bg-accent' : ''
                }`}
                style={{
                  gridTemplateColumns: GRID_COLUMNS,
                  height: 'var(--density-table-row-height)',
                  fontSize: 'var(--density-table-font-size)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <span
                    key={cell.id}
                    role="cell"
                    className={cell.column.id === 'total' ? 'text-right' : 'truncate'}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </span>
                ))}
              </div>
            ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between text-sm text-muted-foreground">
        <span>{total} cotação(ões)</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.page <= 1}
            onClick={() => goToPage(query.page - 1)}
          >
            Anterior
          </Button>
          <span>
            Página {query.page} de {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.page >= pageCount}
            onClick={() => goToPage(query.page + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}
