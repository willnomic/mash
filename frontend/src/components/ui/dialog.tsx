import * as DialogPrimitive from '@radix-ui/react-dialog'

import { cn } from '@/lib/utils'

// Modal genérico — mesma base do CommandDialog (command.tsx), mas pra
// conteúdo qualquer (formulário), não uma lista de comandos. Dois usos
// reais desde o primeiro commit (unidade "criar cliente sem sair do
// fluxo": modal de Party e modal de Branch) — não construído antes de
// existir necessidade (D-048/D-049).
const Dialog = DialogPrimitive.Root

function DialogContent({
  className,
  children,
  title,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-4 shadow-lg',
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="mb-3 text-sm font-semibold text-foreground">
          {title}
        </DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export { Dialog, DialogContent }
