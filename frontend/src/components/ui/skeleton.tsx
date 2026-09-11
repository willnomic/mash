import { cn } from '@/lib/utils'

// Bloco de esqueleto (D-048, unidade "a casca do frontend", item 6): a
// casca aparece desenhada ANTES do dado chegar, nunca tela branca.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
