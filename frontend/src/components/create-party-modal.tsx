import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  createPartySchema,
  isValidCnpj,
  onlyDigits,
  type CreatePartyAddressInput,
} from '@mash/shared'

// Entrada/saída divergem só na opcionalidade de numero/complemento
// dentro de address (mesmo padrão de AcceptFormValues/Output em
// quote-detail.tsx — createPartySchema usa .transform() sem .pipe(),
// D-048 item 1: reaproveitado direto do contrato).
type CreatePartyFormValues = z.input<typeof createPartySchema>
type CreatePartyFormOutput = z.output<typeof createPartySchema>
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiRequestError } from '@/lib/api-client'
import { useCreateParty, type CreatedParty } from '@/hooks/use-create-party'
import { useCnpjLookup } from '@/hooks/use-cnpj-lookup'

// Modal "criar cliente sem sair do fluxo" (D-048): abre de dentro do
// seletor de parte da tela de aceite. Só CNPJ + razão social são
// digitáveis — endereço é auto-preenchido pela consulta OU ausente,
// nunca um formulário pro operador completar (a tela de cadastro
// completa, pra isso, vem depois). CNPJ duplicado no tenant oferece
// "usar esta" em vez de só recusar.
export function CreatePartyModal({
  open,
  initialQuery,
  existingByCnpj,
  onClose,
  onCreated,
}: {
  open: boolean
  initialQuery: string
  existingByCnpj: (cnpj: string) => { id: string; name: string } | undefined
  onClose: () => void
  onCreated: (party: CreatedParty) => void
}) {
  const cnpjRef = useRef<HTMLInputElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const createParty = useCreateParty()
  const cnpjLookup = useCnpjLookup()

  const [formError, setFormError] = useState<string | null>(null)
  const [duplicateParty, setDuplicateParty] = useState<
    { id: string; name: string } | null
  >(null)
  const [address, setAddress] = useState<CreatePartyAddressInput | null>(null)
  const [lookupNote, setLookupNote] = useState<string | null>(null)

  const initialLooksLikeCnpj = /^\d{14}$/.test(onlyDigits(initialQuery))

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePartyFormValues, unknown, CreatePartyFormOutput>({
    resolver: zodResolver(createPartySchema),
    defaultValues: {
      name: initialLooksLikeCnpj ? '' : initialQuery,
      cnpj: initialLooksLikeCnpj ? initialQuery : '',
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      name: initialLooksLikeCnpj ? '' : initialQuery,
      cnpj: initialLooksLikeCnpj ? initialQuery : '',
    })
    setFormError(null)
    setDuplicateParty(null)
    setAddress(null)
    setLookupNote(null)
    // Foco no primeiro campo ao abrir (D-022) — CNPJ, mesmo se a busca
    // já veio de um texto que parecia nome (o operador ainda pode
    // querer digitar o CNPJ certo primeiro).
    cnpjRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function runLookup(rawValue: string) {
    const digits = onlyDigits(rawValue)
    if (!isValidCnpj(digits)) return
    setLookupNote('Consultando CNPJ...')
    setAddress(null)
    try {
      const result = await cnpjLookup.mutateAsync(digits)
      if (!open) return // modal fechou enquanto a consulta corria
      if (result.found) {
        if (result.name) setValue('name', result.name)
        // Cast justificado: a resposta da consulta é JSON externo (não
        // dá pra provar em tempo de compilação que `uf` é uma das 27
        // UFs) — o backend revalida tudo de novo ao criar e descarta o
        // endereço inteiro se algo não bater (nunca bloqueia a
        // criação), então um valor mal formado aqui só significa
        // "endereço não foi salvo", nunca dado incorreto persistido.
        if (result.address) {
          setAddress(result.address as CreatePartyAddressInput)
        }
        setLookupNote(
          result.address
            ? 'Endereço encontrado — será salvo junto.'
            : 'Razão social encontrada; sem endereço completo na Receita.',
        )
      } else {
        setLookupNote(result.reason ?? 'Não encontrado — preencha à mão.')
      }
    } catch {
      if (!open) return
      setLookupNote('Consulta indisponível agora — preencha à mão.')
    }
  }

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null)
    setDuplicateParty(null)
    try {
      const created = await createParty.mutateAsync({
        ...data,
        address: address ?? undefined,
      })
      onCreated(created)
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.error.kind === 'validation') {
          for (const [field, messages] of Object.entries(
            error.error.fieldErrors,
          )) {
            if (field === 'name' || field === 'cnpj') {
              setError(field, { message: messages[0] })
            }
          }
          if (error.error.formErrors[0]) setFormError(error.error.formErrors[0])
          return
        }
        if (error.error.status === 409) {
          // Corpo real do backend: { message, existingParty }. Também
          // aceita achar na lista já carregada (existingByCnpj) como
          // reforço — os dois caminhos levam ao mesmo botão "usar esta".
          const body = error.error.body as
            | { existingParty?: { id: string; name: string } }
            | undefined
          const existing =
            body?.existingParty ?? existingByCnpj(onlyDigits(data.cnpj))
          setDuplicateParty(existing ?? null)
          setFormError(error.error.message)
          return
        }
        setFormError(error.error.message)
        return
      }
      setFormError('Não foi possível criar a parte. Tente novamente.')
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
        <DialogContent title="Criar cliente">
          <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="party-cnpj">CNPJ</Label>
              <Input
                id="party-cnpj"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                aria-invalid={Boolean(errors.cnpj)}
                {...register('cnpj')}
                ref={(el) => {
                  register('cnpj').ref(el)
                  cnpjRef.current = el
                }}
                onBlur={(event) => {
                  register('cnpj').onBlur(event)
                  void runLookup(event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void runLookup((event.target as HTMLInputElement).value)
                    nameRef.current?.focus()
                  }
                }}
              />
              {errors.cnpj && (
                <p className="text-xs text-destructive">{errors.cnpj.message}</p>
              )}
              {lookupNote && (
                <p className="text-xs text-muted-foreground" role="status">
                  {lookupNote}
                </p>
              )}
              {address && (
                <p className="text-xs text-muted-foreground">
                  {address.logradouro}
                  {address.numero ? `, ${address.numero}` : ''} —{' '}
                  {address.bairro}, {address.municipio}/{address.uf} — CEP{' '}
                  {address.cep}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="party-name">Razão social</Label>
              <Input
                id="party-name"
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

            {duplicateParty && (
              <div className="rounded-md border border-border bg-secondary p-2 text-xs">
                <p>CNPJ já cadastrado como "{duplicateParty.name}".</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1.5"
                  onClick={() =>
                    onCreated({
                      id: duplicateParty.id,
                      name: duplicateParty.name,
                      cnpj: null,
                    })
                  }
                >
                  Usar "{duplicateParty.name}"
                </Button>
              </div>
            )}
            {formError && !duplicateParty && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || createParty.isPending}>
                {isSubmitting || createParty.isPending ? 'Criando...' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
