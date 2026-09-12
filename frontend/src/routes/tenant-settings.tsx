import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { QuoteValidityDecision } from '@mash/shared'
import {
  quoteCloseFormSchema,
  decisionToCloseFormValues,
  QUOTE_CLOSE_FORM_UNITS,
  QUOTE_CLOSE_FORM_UNIT_LABEL,
  type QuoteCloseFormValues,
} from '@/lib/quote-close-form.schema'
import {
  useTenantSettings,
  useUpdateTenantSettings,
} from '@/hooks/use-tenant-settings'
import { ApiRequestError } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

// Tela de configuração do tenant (unidade "configuração do tenant"),
// atrás de settings.view/settings.change — a rota (router.tsx) e o item
// de menu (app-layout.tsx) já checam settings.view antes de chegar
// aqui; o backend faz a mesma checagem de novo em GET/POST
// /tenant-settings (guarda dupla, D-055: esconder na tela é
// conveniência, não segurança).
//
// Reaproveita quote-close-form.schema.ts inteiro (unidade+prazo, "não
// vence" como opção explícita do mesmo seletor) — é a MESMA pergunta do
// formulário de fechar cotação, só que gravando o padrão em vez de
// decidir uma cotação específica.
//
// Só um campo hoje: prazo padrão de validade da cotação. "Não vence" é
// opção explícita — omitir nunca é válido, nem aqui nem no fechamento da
// cotação em si.
export function TenantSettingsPage() {
  const settings = useTenantSettings()
  const updateSettings = useUpdateTenantSettings()

  const form = useForm<QuoteCloseFormValues, unknown, QuoteValidityDecision>({
    resolver: zodResolver(quoteCloseFormSchema),
    defaultValues: { unit: 'DAYS', amount: '' },
  })

  const unit = form.watch('unit')

  // O formulário só reflete o que o servidor já tem depois que a
  // consulta chega — sem isso, o formulário abriria sempre em "DAYS" em
  // branco por um instante antes do valor real aparecer (D-049: nada
  // que já apareceu pode se mover à toa).
  useEffect(() => {
    if (settings.data) {
      form.reset(decisionToCloseFormValues(settings.data.defaultQuoteValidity))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data])

  const onSubmit = form.handleSubmit(async (defaultQuoteValidity) => {
    try {
      await updateSettings.mutateAsync({ defaultQuoteValidity })
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof ApiRequestError && error.error.kind === 'http'
            ? error.error.message
            : 'Não foi possível salvar a configuração.',
      })
    }
  })

  if (settings.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-96" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">Configuração</h1>

      <form
        onSubmit={onSubmit}
        className="flex max-w-md flex-col gap-3 rounded-md border border-border p-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Prazo padrão de validade da cotação
          </span>
          <p className="text-xs text-muted-foreground">
            Vem preenchido ao fechar uma cotação — o operador sempre pode
            trocar naquela cotação específica.
          </p>
        </div>

        <div className="flex gap-2">
          {unit !== 'NEVER' && (
            <Input
              {...form.register('amount')}
              inputMode="numeric"
              placeholder="Prazo"
              className="w-20 text-right tabular-nums"
              aria-invalid={Boolean(form.formState.errors.amount)}
            />
          )}
          <select
            {...form.register('unit')}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none"
            style={{ fontSize: 'var(--density-form-font-size)' }}
          >
            {QUOTE_CLOSE_FORM_UNITS.map((code) => (
              <option key={code} value={code}>
                {QUOTE_CLOSE_FORM_UNIT_LABEL[code]}
              </option>
            ))}
          </select>
        </div>
        {form.formState.errors.amount && (
          <p className="text-xs text-destructive">
            {form.formState.errors.amount.message}
          </p>
        )}

        <div>
          <Button type="submit" disabled={updateSettings.isPending}>
            {updateSettings.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>

        {form.formState.errors.root && (
          <p className="text-xs text-destructive" role="alert">
            {form.formState.errors.root.message}
          </p>
        )}
        {updateSettings.isSuccess && !form.formState.isDirty && (
          <p className="text-xs text-muted-foreground" role="status">
            Configuração salva.
          </p>
        )}
      </form>
    </div>
  )
}
