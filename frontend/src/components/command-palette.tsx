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

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Navegar">
      <CommandInput placeholder="Ir para..." />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Telas">
          {navigationCommands.map((entry) => (
            <CommandItem
              key={entry.id}
              value={entry.label}
              onSelect={() => {
                onOpenChange(false)
                void navigate({ to: entry.to })
              }}
            >
              {entry.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
