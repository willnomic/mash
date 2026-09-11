import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createBranchSchema, type CreateBranchInput } from '@mash/shared'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiRequestError } from '@/lib/api-client'
import { useCreateBranch, type CreatedBranch } from '@/hooks/use-create-branch'

// Mesmo tratamento de CreatePartyModal, bem mais simples: Branch só
// tem `name` (unidade "criar cliente sem sair do fluxo", "mesmo
// tratamento, se a filial também não existir").
export function CreateBranchModal({
  open,
  initialQuery,
  onClose,
  onCreated,
}: {
  open: boolean
  initialQuery: string
  onClose: () => void
  onCreated: (branch: CreatedBranch) => void
}) {
  const nameRef = useRef<HTMLInputElement | null>(null)
  const createBranch = useCreateBranch()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateBranchInput>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: { name: initialQuery },
  })

  useEffect(() => {
    if (!open) return
    reset({ name: initialQuery })
    setFormError(null)
    nameRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null)
    try {
      const created = await createBranch.mutateAsync(data)
      onCreated(created)
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.error.kind === 'validation') {
          for (const [field, messages] of Object.entries(
            error.error.fieldErrors,
          )) {
            if (field === 'name') setError(field, { message: messages[0] })
          }
          if (error.error.formErrors[0]) setFormError(error.error.formErrors[0])
          return
        }
        setFormError(error.error.message)
        return
      }
      setFormError('Não foi possível criar a filial. Tente novamente.')
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {open && (
        <DialogContent title="Criar filial">
          <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branch-name">Nome da filial</Label>
              <Input
                id="branch-name"
                aria-invalid={Boolean(errors.name)}
                {...register('name')}
                ref={(el) => {
                  register('name').ref(el)
                  nameRef.current = el
                }}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || createBranch.isPending}>
                {isSubmitting || createBranch.isPending ? 'Criando...' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
