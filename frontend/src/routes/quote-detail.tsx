import { useEffect, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { acceptQuoteSchema } from '@mash/shared'

// Entrada (defaultValues, antes de submeter) e saída (o que
// handleSubmit devolve, já com customerReference normalizado) diferem
// só na opcionalidade de customerReference — mesmo padrão de
// useForm<Input, Context, Output> da parte 1, necessário porque
// acceptQuoteSchema usa .transform() sem .pipe() (D-048 item 1: schema
// reaproveitado direto do contrato, sem duplicar).
type AcceptFormValues = z.input<typeof acceptQuoteSchema>
type AcceptFormOutput = z.output<typeof acceptQuoteSchema>
import {
  quoteCloseFormSchema,
  type QuoteCloseFormOutput,
  type QuoteCloseFormValues,
} from '@/lib/quote-close-form.schema'
import { formatDecimalBRL, formatPercentBRL } from '@/lib/br-number'
import { ApiRequestError } from '@/lib/api-client'
import {
  useQuote,
  useCloseQuote,
  useAcceptQuote,
  useRejectQuote,
  type ValidityTermInput,
} from '@/hooks/use-quote-detail'
import { useParties } from '@/hooks/use-parties'
import { useBranches } from '@/hooks/use-branches'
import type { CreatedParty } from '@/hooks/use-create-party'
import type { CreatedBranch } from '@/hooks/use-create-branch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  EntityCombobox,
  type EntityComboboxHandle,
} from '@/components/entity-combobox'
import { CreatePartyModal } from '@/components/create-party-modal'
import { CreateBranchModal } from '@/components/create-branch-modal'

const PARTY_ROLE_FIELDS = ['senderId', 'recipientId', 'tomadorId'] as const
type PartyRoleField = (typeof PARTY_ROLE_FIELDS)[number]

const PARTY_ROLE_LABEL: Record<PartyRoleField, string> = {
  senderId: 'Remetente',
  recipientId: 'Destinatário',
  tomadorId: 'Tomador',
}

function formatDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

// Cinco estados (D-046/D-047/D-050), dois gravados e um derivado —
// "vencida" nunca é lido do banco, é isExpired calculado no backend a
// cada GET (isQuoteValidityExpired), nunca um status próprio.
function statusLabel(statusCode: string, isExpired: boolean, validUntil: string | null) {
  if (statusCode === 'OPEN') return { text: 'Rascunho', tone: 'neutral' as const }
  if (statusCode === 'ACCEPTED') return { text: 'Aceita', tone: 'positive' as const }
  if (statusCode === 'REJECTED') return { text: 'Recusada', tone: 'negative' as const }
  // CLOSED
  if (isExpired) {
    return {
      text: `Fechada e vencida${validUntil ? ` (venceu em ${formatDate(validUntil)})` : ''}`,
      tone: 'negative' as const,
    }
  }
  return {
    text: `Fechada${validUntil ? `, válida até ${formatDate(validUntil)}` : ''}`,
    tone: 'neutral' as const,
  }
}

const TONE_CLASS: Record<string, string> = {
  neutral: 'text-muted-foreground',
  positive: 'text-foreground font-semibold',
  negative: 'text-destructive font-semibold',
}

// Id de rota, não path — appRoute (router.tsx) é uma layout route sem
// path próprio (id: 'app'), então o id completo dos filhos leva o
// prefixo "/app" mesmo a URL real sendo "/cotacoes/:id" sem ele.
const routeApi = getRouteApi('/app/cotacoes/$id')

export function QuoteDetailPage() {
  const { id: quoteId } = routeApi.useParams()
  const quote = useQuote(quoteId)
  const closeMutation = useCloseQuote(quoteId)
  const acceptMutation = useAcceptQuote(quoteId)
  const rejectMutation = useRejectQuote(quoteId)
  const parties = useParties()
  const branches = useBranches()

  const [pendingClose, setPendingClose] = useState<ValidityTermInput | null>(
    null,
  )
  const [pendingAccept, setPendingAccept] = useState<AcceptFormOutput | null>(
    null,
  )
  const [pendingReject, setPendingReject] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<{
    message: string
    isDuplicate: boolean
  } | null>(null)
  const [rejectError, setRejectError] = useState<string | null>(null)

  const amountRef = useRef<HTMLInputElement | null>(null)
  const branchRef = useRef<EntityComboboxHandle | null>(null)
  const senderRef = useRef<EntityComboboxHandle | null>(null)
  const recipientRef = useRef<EntityComboboxHandle | null>(null)
  const tomadorRef = useRef<EntityComboboxHandle | null>(null)

  // Modal "criar cliente sem sair do fluxo" (D-048): guarda QUAL campo
  // abriu o modal, pra devolver o foco a ele ao fechar (Esc ou depois
  // de criar) e pra saber onde escrever o id criado. Estado do
  // acceptForm (os outros campos já preenchidos) não é tocado por abrir
  // ou fechar o modal — é isso que garante que nada se perde.
  const [createPartyRequest, setCreatePartyRequest] = useState<{
    field: PartyRoleField
    query: string
  } | null>(null)
  const [createBranchRequest, setCreateBranchRequest] = useState<{
    query: string
  } | null>(null)

  function partyRoleRef(field: PartyRoleField) {
    if (field === 'senderId') return senderRef
    if (field === 'recipientId') return recipientRef
    return tomadorRef
  }

  // Radix Dialog restaura foco pro elemento que tinha foco quando o
  // modal abriu (acessibilidade padrão dele) — corre DEPOIS do onClose/
  // onCreated que já chamamos, então uma chamada síncrona a .focus()
  // aqui perde a corrida e o foco escapa pra fora da tela (achado real
  // no navegador: caiu no link "Início" da sidebar). setTimeout(0)
  // empurra nosso .focus() pra depois da restauração do Radix, que
  // sempre vence.
  function focusSoon(ref: React.RefObject<EntityComboboxHandle | null>) {
    setTimeout(() => ref.current?.focus(), 0)
  }

  function closeCreateParty() {
    const field = createPartyRequest?.field
    setCreatePartyRequest(null)
    if (field) focusSoon(partyRoleRef(field))
  }

  function handlePartyCreated(party: CreatedParty) {
    const field = createPartyRequest?.field
    if (field) {
      acceptForm.setValue(field, party.id, { shouldValidate: true })
    }
    setCreatePartyRequest(null)
    if (field) focusSoon(partyRoleRef(field))
  }

  function closeCreateBranch() {
    setCreateBranchRequest(null)
    focusSoon(branchRef)
  }

  function handleBranchCreated(branch: CreatedBranch) {
    acceptForm.setValue('branchId', branch.id, { shouldValidate: true })
    setCreateBranchRequest(null)
    focusSoon(branchRef)
  }

  const closeForm = useForm<QuoteCloseFormValues, unknown, QuoteCloseFormOutput>({
    resolver: zodResolver(quoteCloseFormSchema),
    defaultValues: { unit: 'DAYS', amount: '' },
  })
  const acceptForm = useForm<AcceptFormValues, unknown, AcceptFormOutput>({
    resolver: zodResolver(acceptQuoteSchema),
    defaultValues: {
      branchId: '',
      senderId: '',
      recipientId: '',
      tomadorId: '',
      customerReference: '',
    },
  })

  useEffect(() => {
    if (quote.data?.statusCode === 'OPEN') {
      amountRef.current?.focus()
    } else if (
      quote.data?.statusCode === 'CLOSED' &&
      !quote.data.isExpired
    ) {
      branchRef.current?.focus()
    }
  }, [quote.data?.statusCode, quote.data?.isExpired])

  if (quote.isLoading) {
    return (
      <div className="flex h-full flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-1 gap-4">
          <Skeleton className="flex-1" />
          <Skeleton className="w-80 shrink-0" />
        </div>
      </div>
    )
  }

  if (quote.isError || !quote.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Cotação não encontrada.
      </p>
    )
  }

  const q = quote.data
  const status = statusLabel(q.statusCode, q.isExpired, q.validUntil)

  const onCloseSubmit = closeForm.handleSubmit((data) => {
    setPendingClose(data)
  })

  const onAcceptSubmit = acceptForm.handleSubmit((data) => {
    setPendingAccept(data)
  })

  async function confirmClose() {
    if (!pendingClose) return
    setCloseError(null)
    try {
      await closeMutation.mutateAsync(pendingClose)
      setPendingClose(null)
    } catch (error) {
      setPendingClose(null)
      setCloseError(
        error instanceof ApiRequestError
          ? error.error.kind === 'http'
            ? error.error.message
            : 'Não foi possível fechar a cotação.'
          : 'Não foi possível fechar a cotação.',
      )
    }
  }

  async function confirmAccept() {
    if (!pendingAccept) return
    setAcceptError(null)
    try {
      await acceptMutation.mutateAsync(pendingAccept)
      setPendingAccept(null)
    } catch (error) {
      setPendingAccept(null)
      if (error instanceof ApiRequestError && error.error.kind === 'http') {
        setAcceptError({
          message: error.error.message,
          isDuplicate: error.error.status === 409,
        })
        // 409 é idempotência (D-048): a cotação JÁ foi aceita — o
        // estado real mudou desde a última leitura, então recarrega
        // pra mostrar o pedido que já existe, não deixa a tela
        // congelada em "Fechada".
        if (error.error.status === 409) {
          void quote.refetch()
        }
      } else {
        setAcceptError({
          message: 'Não foi possível aceitar a cotação.',
          isDuplicate: false,
        })
      }
    }
  }

  async function confirmReject() {
    setRejectError(null)
    try {
      await rejectMutation.mutateAsync()
      setPendingReject(false)
    } catch (error) {
      setPendingReject(false)
      setRejectError(
        error instanceof ApiRequestError && error.error.kind === 'http'
          ? error.error.message
          : 'Não foi possível recusar a cotação.',
      )
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-foreground">
          Cotação por custo
        </h1>
        <span className={`text-sm ${TONE_CLASS[status.tone]}`}>
          {status.text}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">UF (ICMS)</span>
            <span>{q.icmsUf ?? '—'}</span>
            <span className="text-muted-foreground">Margem</span>
            <span className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {q.marginPercentage ? `${formatPercentBRL(q.marginPercentage)}%` : '—'}
            </span>
            {q.icmsRateApplied && (
              <>
                <span className="text-muted-foreground">Alíquotas aplicadas</span>
                <span className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ICMS {formatPercentBRL(q.icmsRateApplied)}% · IBS{' '}
                  {formatPercentBRL(q.ibsRateApplied ?? '0')}% · CBS{' '}
                  {formatPercentBRL(q.cbsRateApplied ?? '0')}%
                </span>
              </>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-md border border-border">
            <div
              className="grid shrink-0 items-center gap-2 border-b border-border bg-secondary px-2 text-xs font-medium text-muted-foreground"
              style={{ gridTemplateColumns: '1fr 1.4fr 140px', height: 'var(--density-table-row-height)' }}
            >
              <span>Tipo de custo</span>
              <span>Descrição</span>
              <span className="text-right">Valor</span>
            </div>
            {q.costLines.map((line) => (
              <div
                key={line.id}
                className="grid items-center gap-2 px-2 text-sm"
                style={{ gridTemplateColumns: '1fr 1.4fr 140px', height: 'var(--density-table-row-height)' }}
              >
                <span>{line.costTypeName}</span>
                <span className="text-muted-foreground">{line.description ?? ''}</span>
                <span className="text-right tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatDecimalBRL(line.amount)}
                </span>
              </div>
            ))}
            <div
              className="grid items-center gap-2 border-t border-border px-2 text-sm font-medium"
              style={{ gridTemplateColumns: '1fr 1.4fr 140px', height: 'var(--density-table-row-height)' }}
            >
              <span />
              <span className="text-right">Custo total</span>
              <span className="text-right tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatDecimalBRL(q.costSubtotal)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex w-80 shrink-0 flex-col gap-3 border-l border-border pl-4">
          {q.total && (
            <div>
              <span className="text-xs text-muted-foreground">Preço final</span>
              <div
                className="text-2xl font-semibold tabular-nums text-foreground"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                R$ {formatDecimalBRL(q.total)}
              </div>
            </div>
          )}

          {/* Rascunho: fechar com prazo obrigatório (D-050). Fechar é
              irreversível — botão só mostra a confirmação, quem fecha
              de fato é "Sim, fechar". */}
          {q.statusCode === 'OPEN' && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-sm font-medium">Fechar cotação</span>
              <div className="flex gap-2">
                <Input
                  {...closeForm.register('amount')}
                  ref={(el) => {
                    closeForm.register('amount').ref(el)
                    amountRef.current = el
                  }}
                  inputMode="numeric"
                  placeholder="Prazo"
                  className="w-20 text-right tabular-nums"
                  aria-invalid={Boolean(closeForm.formState.errors.amount)}
                />
                <select
                  {...closeForm.register('unit')}
                  className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none"
                  style={{ fontSize: 'var(--density-form-font-size)' }}
                >
                  <option value="DAYS">dias</option>
                  <option value="MONTHS">meses</option>
                </select>
              </div>
              {closeForm.formState.errors.amount && (
                <p className="text-xs text-destructive">
                  {closeForm.formState.errors.amount.message}
                </p>
              )}
              {!pendingClose ? (
                <Button type="button" onClick={onCloseSubmit}>
                  Fechar cotação
                </Button>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary p-2">
                  <p className="text-xs">
                    Depois de fechada a cotação não pode ser editada. Tem
                    certeza?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={closeMutation.isPending}
                      onClick={confirmClose}
                    >
                      {closeMutation.isPending ? 'Fechando...' : 'Sim, fechar'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPendingClose(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {closeError && (
                <p className="text-xs text-destructive" role="alert">
                  {closeError}
                </p>
              )}
            </div>
          )}

          {/* Fechada e vencida: só recusar é possível (D-046) — o motivo
              aparece explícito, o formulário de aceite nem existe aqui. */}
          {q.statusCode === 'CLOSED' && q.isExpired && (
            <p className="text-sm text-destructive">
              Prazo de validade vencido — não pode mais ser aceita, só
              recusada.
            </p>
          )}

          {/* Fechada e válida: aceitar cria o pedido, ou recusar. */}
          {q.statusCode === 'CLOSED' && !q.isExpired && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-sm font-medium">Aceitar cotação</span>
              <div className="flex flex-col gap-1">
                <Label htmlFor="branchId">Filial</Label>
                <EntityCombobox
                  ref={branchRef}
                  id="branchId"
                  value={acceptForm.watch('branchId')}
                  onChange={(id) =>
                    acceptForm.setValue('branchId', id, { shouldValidate: true })
                  }
                  options={
                    branches.data?.map((b) => ({ id: b.id, label: b.name })) ?? []
                  }
                  isLoading={branches.isLoading}
                  createLabel="filial"
                  ariaInvalid={Boolean(acceptForm.formState.errors.branchId)}
                  onRequestCreate={(query) =>
                    setCreateBranchRequest({ query })
                  }
                />
              </div>

              {PARTY_ROLE_FIELDS.map((field) => (
                <div key={field} className="flex flex-col gap-1">
                  <Label htmlFor={field}>{PARTY_ROLE_LABEL[field]}</Label>
                  <EntityCombobox
                    ref={partyRoleRef(field)}
                    id={field}
                    value={acceptForm.watch(field)}
                    onChange={(id) =>
                      acceptForm.setValue(field, id, { shouldValidate: true })
                    }
                    options={
                      parties.data?.map((p) => ({ id: p.id, label: p.name })) ??
                      []
                    }
                    isLoading={parties.isLoading}
                    createLabel="cliente"
                    ariaInvalid={Boolean(acceptForm.formState.errors[field])}
                    onRequestCreate={(query) =>
                      setCreatePartyRequest({ field, query })
                    }
                  />
                </div>
              ))}

              <div className="flex flex-col gap-1">
                <Label htmlFor="customerReference">
                  Referência do cliente (opcional)
                </Label>
                <Input
                  id="customerReference"
                  {...acceptForm.register('customerReference')}
                />
              </div>

              {!pendingAccept ? (
                <Button type="button" onClick={onAcceptSubmit}>
                  Aceitar cotação
                </Button>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary p-2">
                  <p className="text-xs">
                    Aceitar cria o pedido agora, sem volta. Tem certeza?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={acceptMutation.isPending}
                      onClick={confirmAccept}
                    >
                      {acceptMutation.isPending ? 'Aceitando...' : 'Sim, aceitar'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPendingAccept(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {acceptError && (
                <p
                  className={
                    acceptError.isDuplicate
                      ? 'text-xs text-muted-foreground'
                      : 'text-xs text-destructive'
                  }
                  role={acceptError.isDuplicate ? 'status' : 'alert'}
                >
                  {acceptError.message}
                </p>
              )}
            </div>
          )}

          {/* Recusar: disponível pra Fechada (vencida ou não), nunca
              pra Rascunho/Aceita/Recusada — a tela só mostra o botão
              quando statusCode é CLOSED. */}
          {q.statusCode === 'CLOSED' && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              {!pendingReject ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPendingReject(true)}
                >
                  Recusar cotação
                </Button>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary p-2">
                  <p className="text-xs">
                    Recusar registra que o cliente não aceitou. Tem certeza?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={rejectMutation.isPending}
                      onClick={confirmReject}
                    >
                      {rejectMutation.isPending ? 'Recusando...' : 'Sim, recusar'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPendingReject(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {rejectError && (
                <p className="text-xs text-destructive" role="alert">
                  {rejectError}
                </p>
              )}
            </div>
          )}

          {/* Aceita: mostra o pedido que nasceu — sem tela de pedido
              ainda (fora de escopo), só a confirmação do que foi
              criado (número, quantidade de viagens, preço unitário). */}
          {q.statusCode === 'ACCEPTED' && q.order && (
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
              <span className="font-medium">Pedido criado</span>
              <div className="grid grid-cols-2 gap-1">
                <span className="text-muted-foreground">Número</span>
                <span className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {q.order.number}
                </span>
                <span className="text-muted-foreground">Viagens</span>
                <span className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {q.order.tripsCount}
                </span>
                <span className="text-muted-foreground">Preço unitário</span>
                <span className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  R$ {formatDecimalBRL(q.order.unitPrice)}
                </span>
              </div>
            </div>
          )}

          {q.statusCode === 'REJECTED' && (
            <p className="text-sm text-muted-foreground">
              Cotação recusada pelo cliente.
            </p>
          )}
        </div>
      </div>

      <CreatePartyModal
        open={createPartyRequest !== null}
        initialQuery={createPartyRequest?.query ?? ''}
        existingByCnpj={(cnpj) =>
          parties.data?.find((p) => p.cnpj === cnpj) ?? undefined
        }
        onClose={closeCreateParty}
        onCreated={handlePartyCreated}
      />
      <CreateBranchModal
        open={createBranchRequest !== null}
        initialQuery={createBranchRequest?.query ?? ''}
        onClose={closeCreateBranch}
        onCreated={handleBranchCreated}
      />
    </div>
  )
}
