import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Decimal } from 'decimal.js'
import {
  calculateQuotePricing,
  BRAZILIAN_STATE_CODES,
  type BrazilianStateCode,
} from '@mash/shared'
import {
  quoteCostBasedFormSchema,
  type QuoteCostBasedFormOutput,
  type QuoteCostBasedFormValues,
} from '@/lib/quote-cost-based-form.schema'
import {
  formatDecimalBRL,
  formatPercentBRL,
  parseBrDecimalLenient,
} from '@/lib/br-number'
import { deriveMarginPercentFromFinalPrice } from '@/lib/quote-margin-from-price'
import { ApiRequestError } from '@/lib/api-client'
import { useQuoteCostTypes } from '@/hooks/use-quote-cost-types'
import { useTaxRatePreview } from '@/hooks/use-tax-rate-preview'
import { useCreateCostBasedQuote } from '@/hooks/use-create-cost-based-quote'
import { useParties } from '@/hooks/use-parties'
import { usePermissions } from '@/hooks/use-session'
import type { CreatedParty } from '@/hooks/use-create-party'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  EntityCombobox,
  type EntityComboboxHandle,
} from '@/components/entity-combobox'
import { CreatePartyModal } from '@/components/create-party-modal'

const EMPTY_LINE = { costTypeId: '', description: '', amount: '' }

const defaultValues: QuoteCostBasedFormValues = {
  partyId: '',
  icmsUf: '' as BrazilianStateCode,
  marginPercentage: '',
  costLines: [EMPTY_LINE],
}

// Cotação por custo, parte 1 (D-041/D-046/D-048/D-049): montar, ver o
// preço recalculando ao vivo, salvar rascunho. Fechar/aceitar/recusar
// (D-046/D-047) e a lista de cotações são a parte 2 — não construídos
// aqui.
export function QuoteCostBasedPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [priceDisplay, setPriceDisplay] = useState('')

  const costTypes = useQuoteCostTypes()
  const createQuote = useCreateCostBasedQuote()
  const parties = useParties()
  const { hasPermission } = usePermissions()

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<
    QuoteCostBasedFormValues,
    unknown,
    QuoteCostBasedFormOutput
  >({
    resolver: zodResolver(quoteCostBasedFormSchema),
    defaultValues,
  })
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'costLines',
  })
  const watched = useWatch({ control })

  const rates = useTaxRatePreview(watched.icmsUf || undefined)

  // Modal "criar cliente sem sair do fluxo" (D-052), reaproveitado aqui:
  // quem pediu a cotação (unidade "vincular cliente à Quote") é a
  // PRIMEIRA coisa que o operador sabe, então o campo abre o mesmo
  // combobox/modal já usado no aceite, não um componente novo.
  const [createPartyRequest, setCreatePartyRequest] = useState<{
    query: string
  } | null>(null)
  const partyRef = useRef<EntityComboboxHandle | null>(null)

  // Mesma corrida achada em quote-detail.tsx: o Radix Dialog restaura
  // foco pro elemento que abriu o modal DEPOIS do onClose/onCreated que
  // já chamamos — setTimeout(0) empurra nosso .focus() pra depois disso.
  function focusPartySoon() {
    setTimeout(() => partyRef.current?.focus(), 0)
  }

  function closeCreateParty() {
    setCreatePartyRequest(null)
    focusPartySoon()
  }

  function handlePartyCreated(party: CreatedParty) {
    setValue('partyId', party.id, { shouldValidate: true })
    setCreatePartyRequest(null)
    focusPartySoon()
  }

  // Refs pro teclado (D-022): nenhuma ação só no mouse. Foco automático
  // no primeiro campo, Enter avança, adicionar linha sem tirar a mão do
  // teclado.
  const ufRef = useRef<HTMLSelectElement | null>(null)
  const costTypeRefs = useRef<Map<number, HTMLSelectElement>>(new Map())
  const amountRefs = useRef<Map<number, HTMLInputElement>>(new Map())
  const marginRef = useRef<HTMLInputElement | null>(null)
  const priceRef = useRef<HTMLInputElement | null>(null)
  const pendingFocusIndexRef = useRef<number | null>(null)
  const priceFieldFocusedRef = useRef(false)

  // Cliente é a primeira coisa que o operador sabe (unidade "vincular
  // cliente à Quote") — foco inicial migrou de UF pra ele.
  useEffect(() => {
    partyRef.current?.focus()
  }, [])

  useEffect(() => {
    if (pendingFocusIndexRef.current !== null) {
      const index = pendingFocusIndexRef.current
      pendingFocusIndexRef.current = null
      costTypeRefs.current.get(index)?.focus()
    }
  }, [fields.length])

  // Preview ao vivo (D-048, item "sem botão de calcular"): usa
  // calculateQuotePricing de @mash/shared — nunca reimplementado. Sem
  // alíquota disponível ainda (UF não escolhida, ou carregando), não
  // calcula nada — nunca zero nem valor inventado.
  //
  // Chave de dependência extraída (não inline no array do useMemo): o
  // linter só consegue estaticamente conferir a lista de dependências
  // quando cada item é uma referência simples, não uma expressão.
  const costLinesKey = JSON.stringify(watched.costLines)
  const pricingPreview = useMemo(() => {
    if (!rates.data) return null
    const costLines = (watched.costLines ?? []).map((line) => ({
      amount: parseBrDecimalLenient(line?.amount ?? ''),
    }))
    const marginRatePercent = parseBrDecimalLenient(
      watched.marginPercentage ?? '',
    )
    return calculateQuotePricing({
      costLines,
      icmsRatePercent: rates.data.icmsRatePercent,
      ibsRatePercent: rates.data.ibsRatePercent,
      ibsComposesPrice: rates.data.ibsComposesPrice,
      cbsRatePercent: rates.data.cbsRatePercent,
      cbsComposesPrice: rates.data.cbsComposesPrice,
      marginRatePercent,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costLinesKey, watched.marginPercentage, rates.data])

  // Espelha o preço final no campo "Preço final" sempre que a margem (ou
  // custo, ou alíquota) mudar — MAS nunca enquanto o operador está
  // digitando ali dentro (senão o cursor pula e a digitação quebra). É
  // a metade "margem → preço" do binding dos dois campos.
  useEffect(() => {
    if (!pricingPreview) return
    if (priceFieldFocusedRef.current) return
    setPriceDisplay(formatDecimalBRL(pricingPreview.finalPrice))
    setPriceError(null)
  }, [pricingPreview])

  function handlePriceChange(value: string) {
    setPriceDisplay(value)
    if (!pricingPreview) return
    if (value.trim() === '') {
      setPriceError(null)
      return
    }
    const typedPrice = new Decimal(parseBrDecimalLenient(value))
    const result = deriveMarginPercentFromFinalPrice(
      pricingPreview.priceBeforeMargin,
      typedPrice,
    )
    if (!result.ok) {
      setPriceError(
        result.reason === 'no-cost'
          ? 'Adicione uma linha de custo antes de definir o preço.'
          : 'Preço não pode ser menor que o custo com impostos.',
      )
      return
    }
    setPriceError(null)
    setValue('marginPercentage', formatPercentBRL(result.marginPercent), {
      shouldDirty: true,
    })
  }

  function handleAmountKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (index === fields.length - 1) {
      pendingFocusIndexRef.current = fields.length
      append({ ...EMPTY_LINE })
    } else {
      amountRefs.current.get(index + 1)?.focus()
    }
  }

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null)
    try {
      const created = await createQuote.mutateAsync(data)
      // Rascunho salvo — a parte 2 (fechar/aceitar/recusar, D-050) mora
      // na tela de detalhe. Navega em vez de resetar o formulário: não
      // tem mais razão pra montar outra cotação na mesma tela, o
      // caminho natural é seguir com a que acabou de nascer.
      await navigate({ to: '/cotacoes/$id', params: { id: created.id } })
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.error.kind === 'validation') {
          for (const [field, messages] of Object.entries(
            error.error.fieldErrors,
          )) {
            if (
              field === 'partyId' ||
              field === 'icmsUf' ||
              field === 'marginPercentage'
            ) {
              setError(field, { message: messages[0] })
            } else {
              setFormError(messages[0])
            }
          }
          if (error.error.formErrors[0]) {
            setFormError(error.error.formErrors[0])
          }
        } else {
          setFormError(error.error.message)
        }
        return
      }
      setFormError('Não foi possível salvar o rascunho. Tente novamente.')
    }
  })

  // Erro de nível de ARRAY (ex.: "adicione ao menos uma linha") mora em
  // .root nas versões recentes do react-hook-form — .message direto é
  // reservado a erro por índice (costLines[0].amount).
  const costLinesArrayError =
    (errors.costLines as { root?: { message?: string } } | undefined)?.root
      ?.message ?? null

  const ratesUnavailableReason =
    rates.error instanceof ApiRequestError && rates.error.error.kind === 'http'
      ? rates.error.error.message
      : null

  return (
    <div className="flex h-full flex-col gap-3">
      <h1 className="text-base font-semibold text-foreground">
        Cotação por custo
      </h1>

      <form
        onSubmit={onSubmit}
        className="flex min-h-0 flex-1 gap-4"
        noValidate
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex w-72 flex-col gap-1.5">
            <Label htmlFor="partyId">Cliente</Label>
            <EntityCombobox
              ref={partyRef}
              id="partyId"
              value={watched.partyId ?? ''}
              onChange={(id) =>
                setValue('partyId', id, { shouldValidate: true })
              }
              options={
                parties.data?.map((p) => ({ id: p.id, label: p.name })) ?? []
              }
              isLoading={parties.isLoading}
              createLabel="cliente"
              ariaInvalid={Boolean(errors.partyId)}
              onRequestCreate={
                hasPermission('registration.create')
                  ? (query) => setCreatePartyRequest({ query })
                  : undefined
              }
            />
            {errors.partyId && (
              <p className="text-xs text-destructive">
                {errors.partyId.message}
              </p>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div className="flex w-24 flex-col gap-1.5">
              <Label htmlFor="icmsUf">UF (ICMS)</Label>
              <select
                id="icmsUf"
                {...register('icmsUf')}
                ref={(el) => {
                  register('icmsUf').ref(el)
                  ufRef.current = el
                }}
                aria-invalid={Boolean(errors.icmsUf)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    costTypeRefs.current.get(0)?.focus()
                  }
                }}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive"
                style={{ fontSize: 'var(--density-form-font-size)' }}
              >
                <option value="">--</option>
                {BRAZILIAN_STATE_CODES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
              {errors.icmsUf && (
                <p className="text-xs text-destructive">
                  {errors.icmsUf.message}
                </p>
              )}
            </div>
            {ratesUnavailableReason && (
              <p className="pb-1.5 text-xs text-destructive" role="alert">
                Alíquota indisponível: {ratesUnavailableReason}
              </p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-md border border-border">
            <div
              className="grid shrink-0 items-center gap-2 border-b border-border bg-secondary px-2 text-xs font-medium text-muted-foreground"
              style={{
                gridTemplateColumns: '1fr 1.4fr 140px 32px',
                height: 'var(--density-table-row-height)',
              }}
            >
              <span>Tipo de custo</span>
              <span>Descrição</span>
              <span className="text-right">Valor</span>
              <span />
            </div>

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid items-center gap-2 px-2"
                style={{
                  gridTemplateColumns: '1fr 1.4fr 140px 32px',
                  height: 'var(--density-table-row-height)',
                }}
              >
                <select
                  {...register(`costLines.${index}.costTypeId`)}
                  ref={(el) => {
                    register(`costLines.${index}.costTypeId`).ref(el)
                    if (el) costTypeRefs.current.set(index, el)
                    else costTypeRefs.current.delete(index)
                  }}
                  disabled={costTypes.isLoading}
                  aria-invalid={Boolean(errors.costLines?.[index]?.costTypeId)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  style={{ fontSize: 'var(--density-form-font-size)' }}
                >
                  <option value="">
                    {costTypes.isLoading ? 'Carregando...' : 'Selecione'}
                  </option>
                  {costTypes.data?.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>

                <Input
                  {...register(`costLines.${index}.description`)}
                  placeholder="Opcional"
                />

                <Input
                  {...register(`costLines.${index}.amount`)}
                  ref={(el) => {
                    register(`costLines.${index}.amount`).ref(el)
                    if (el) amountRefs.current.set(index, el)
                    else amountRefs.current.delete(index)
                  }}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="text-right tabular-nums"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                  aria-invalid={Boolean(errors.costLines?.[index]?.amount)}
                  onKeyDown={(event) => handleAmountKeyDown(event, index)}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                  aria-label="Remover linha"
                >
                  ×
                </Button>
              </div>
            ))}
          </div>

          {costLinesArrayError && (
            <p className="text-xs text-destructive">{costLinesArrayError}</p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              pendingFocusIndexRef.current = fields.length
              append({ ...EMPTY_LINE })
            }}
          >
            + Adicionar linha
          </Button>
        </div>

        <div className="flex w-72 shrink-0 flex-col gap-3 border-l border-border pl-4">
          <div className="flex flex-col gap-1 text-sm">
            {rates.isLoading && watched.icmsUf ? (
              <>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </>
            ) : pricingPreview ? (
              pricingPreview.breakdown.slice(0, -1).map((line) => (
                <div
                  key={line.label}
                  className="flex items-baseline justify-between"
                >
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatDecimalBRL(line.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">
                Escolha a UF para calcular.
              </p>
            )}
          </div>

          <div className="border-t border-border pt-2">
            <span className="text-xs text-muted-foreground">
              Preço final
            </span>
            <div
              className="text-2xl font-semibold tabular-nums text-foreground"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {pricingPreview
                ? `R$ ${formatDecimalBRL(pricingPreview.finalPrice)}`
                : '—'}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="marginPercentage">Margem (%)</Label>
            <Input
              id="marginPercentage"
              {...register('marginPercentage')}
              ref={(el) => {
                register('marginPercentage').ref(el)
                marginRef.current = el
              }}
              inputMode="decimal"
              placeholder="0,00"
              className="text-right tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
              aria-invalid={Boolean(errors.marginPercentage)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  priceRef.current?.focus()
                }
              }}
            />
            {errors.marginPercentage && (
              <p className="text-xs text-destructive">
                {errors.marginPercentage.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="finalPrice">Preço final (R$)</Label>
            <Input
              id="finalPrice"
              value={priceDisplay}
              disabled={!pricingPreview}
              onFocus={() => {
                priceFieldFocusedRef.current = true
              }}
              onBlur={() => {
                priceFieldFocusedRef.current = false
              }}
              onChange={(event) => handlePriceChange(event.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="text-right tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
              ref={priceRef}
            />
            {priceError && (
              <p className="text-xs text-destructive" role="alert">
                {priceError}
              </p>
            )}
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting || createQuote.isPending}
            className="mt-1"
          >
            {isSubmitting || createQuote.isPending
              ? 'Salvando...'
              : 'Salvar rascunho'}
          </Button>
        </div>
      </form>

      <CreatePartyModal
        open={createPartyRequest !== null}
        initialQuery={createPartyRequest?.query ?? ''}
        existingByCnpj={(cnpj) =>
          parties.data?.find((p) => p.cnpj === cnpj) ?? undefined
        }
        onClose={closeCreateParty}
        onCreated={handlePartyCreated}
      />
    </div>
  )
}
