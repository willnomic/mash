import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Input } from '@/components/ui/input'

export interface ComboboxOption {
  id: string
  label: string
}

export interface EntityComboboxHandle {
  focus: () => void
}

// Seletor com busca + "criar novo" (D-048) — reutilizado pros quatro
// campos do aceite (filial, remetente, destinatário, tomador; unidade
// "criar cliente sem sair do fluxo"). Sem popover de terceiro
// (@radix-ui/react-popover não é dependência do projeto): a lista é um
// <div> posicionado abaixo do campo, fechado por clique fora ou Esc —
// suficiente pro caso e sem dependência nova.
export const EntityCombobox = forwardRef<
  EntityComboboxHandle,
  {
    id: string
    value: string
    onChange: (id: string) => void
    options: ComboboxOption[]
    isLoading?: boolean
    placeholder?: string
    createLabel: string
    onRequestCreate: (query: string) => void
    ariaInvalid?: boolean
  }
>(function EntityCombobox(
  {
    id,
    value,
    onChange,
    options,
    isLoading,
    placeholder = 'Selecione',
    createLabel,
    onRequestCreate,
    ariaInvalid,
  },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  const selected = options.find((option) => option.id === value)
  const filtered = query
    ? options.filter((option) =>
        option.label.toLowerCase().includes(query.toLowerCase()),
      )
    : options

  useEffect(() => {
    if (!open) return
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  function selectOption(optionId: string) {
    onChange(optionId)
    setOpen(false)
    setQuery('')
  }

  function requestCreate() {
    const typed = query
    setOpen(false)
    setQuery('')
    onRequestCreate(typed)
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        ref={inputRef}
        value={open ? query : (selected?.label ?? '')}
        placeholder={isLoading ? 'Carregando...' : placeholder}
        disabled={isLoading}
        autoComplete="off"
        aria-invalid={ariaInvalid}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
            setQuery('')
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault()
            if (filtered.length === 1) {
              selectOption(filtered[0].id)
            }
          }
        }}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Nada encontrado.
            </p>
          )}
          {filtered.map((option) => (
            <button
              key={option.id}
              type="button"
              className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => selectOption(option.id)}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            className="flex w-full items-center border-t border-border px-3 py-1.5 text-left text-sm text-primary hover:bg-accent"
            onClick={requestCreate}
          >
            + Criar {createLabel}
            {query ? ` "${query}"` : ''}
          </button>
        </div>
      )}
    </div>
  )
})
