import { z } from 'zod'
import { quoteValidityDecisionSchema, type QuoteValidityDecision } from '@mash/shared'

// Unidade "configuração do tenant": o fechamento não aceita mais
// omissão — "não vence" é uma opção do MESMO seletor de unidade, não um
// checkbox à parte, porque o operador escolhe uma coisa só (quanto tempo
// vale, ou nunca vence), nunca as duas.
//
// Este módulo também alimenta a tela de configuração do tenant
// (tenant-settings.tsx): "quanto tempo vale, ou nunca vence" é a MESMA
// pergunta lá (prazo padrão) e aqui (prazo desta cotação) — um schema
// só, sem duplicar a regra (D-048 item 1 / antirredundância).
export const QUOTE_CLOSE_FORM_UNITS = ['DAYS', 'MONTHS', 'YEARS', 'NEVER'] as const
export type QuoteCloseFormUnit = (typeof QUOTE_CLOSE_FORM_UNITS)[number]

export const QUOTE_CLOSE_FORM_UNIT_LABEL: Record<QuoteCloseFormUnit, string> = {
  DAYS: 'dias',
  MONTHS: 'meses',
  YEARS: 'anos',
  NEVER: 'Não vence',
}

// amount chega como texto de <input type="number"> e só faz sentido
// quando unit !== 'NEVER' — .transform() decide a forma de saída
// (QuoteValidityDecision) e valida amount condicionalmente; .pipe()
// contra quoteValidityDecisionSchema (@mash/shared) garante que o
// resultado bate o mesmo contrato que o backend usa, sem duplicar a
// regra (D-048 item 1).
export const quoteCloseFormSchema = z
  .object({
    unit: z.enum(QUOTE_CLOSE_FORM_UNITS),
    amount: z.string(),
  })
  .transform((data, ctx) => {
    if (data.unit === 'NEVER') {
      return { type: 'NEVER' as const }
    }
    if (data.amount.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Informe o prazo' })
      return z.NEVER
    }
    const amount = Number(data.amount)
    if (!Number.isInteger(amount) || amount <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Prazo precisa ser maior que zero',
      })
      return z.NEVER
    }
    return { type: 'TERM' as const, term: { unit: data.unit, amount } }
  })
  .pipe(quoteValidityDecisionSchema)

export type QuoteCloseFormValues = z.input<typeof quoteCloseFormSchema>
export type QuoteCloseFormOutput = z.output<typeof quoteCloseFormSchema>

// Inverso de quoteCloseFormSchema — usado pra pré-encher o formulário
// (prazo padrão do tenant vindo de GET /me, ou o valor já configurado
// vindo de GET /tenant-settings). NULO (tenant não configurou nada, ou
// campo de configuração ainda vazio) cai no mesmo default de sempre:
// DAYS com amount em branco, exatamente como se ninguém tivesse
// pré-preenchido nada.
export function decisionToCloseFormValues(
  decision: QuoteValidityDecision | null,
): QuoteCloseFormValues {
  if (!decision) return { unit: 'DAYS', amount: '' }
  if (decision.type === 'NEVER') return { unit: 'NEVER', amount: '' }
  return { unit: decision.term.unit, amount: String(decision.term.amount) }
}
