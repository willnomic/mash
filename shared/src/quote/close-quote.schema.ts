import { z } from 'zod';

// Espelha QuoteValidityTerm (quote-validity/quote-validity.types.ts) —
// não importa o tipo porque é só um type, não um schema; a forma é a
// mesma de propósito.
export const quoteValidityTermSchema = z.discriminatedUnion('unit', [
  z.object({ unit: z.literal('DAYS'), amount: z.number().int().positive() }),
  z.object({ unit: z.literal('MONTHS'), amount: z.number().int().positive() }),
  z.object({ unit: z.literal('YEARS'), amount: z.number().int().positive() }),
]);

// Decisão de validade (unidade "configuração do tenant — prazo padrão
// de validade da cotação"): PRAZO OBRIGATÓRIO desde a D-051 na tela, e
// agora também no service (D-046 registrava "prazo omitido = nunca
// vence" como padrão inseguro silencioso — omitir deixou de ser uma
// opção válida). "NEVER" é escolha EXPLÍCITA — o mesmo shape serve
// tanto pra fechar UMA cotação quanto pro prazo padrão configurado
// pelo tenant (TenantSettings), porque a pergunta é idêntica nos dois
// lugares: "quanto tempo esta cotação vale, ou nunca vence?".
export const quoteValidityDecisionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TERM'), term: quoteValidityTermSchema }),
  z.object({ type: z.literal('NEVER') }),
]);

export const closeQuoteSchema = z.object({
  validity: quoteValidityDecisionSchema,
});

export type QuoteValidityTermInput = z.infer<typeof quoteValidityTermSchema>;
export type QuoteValidityDecisionInput = z.infer<
  typeof quoteValidityDecisionSchema
>;
export type CloseQuoteInput = z.infer<typeof closeQuoteSchema>;
