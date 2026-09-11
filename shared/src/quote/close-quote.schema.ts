import { z } from 'zod';

// Espelha QuoteValidityTerm (quote-validity/quote-validity.types.ts) —
// não importa o tipo porque é só um type, não um schema; a forma é a
// mesma de propósito. PRAZO OBRIGATÓRIO (unidade "cotação por custo,
// parte 2"): QuoteService.close() aceita validityTerm opcional por
// compatibilidade (D-046), mas cotação sem prazo nunca expira — esse é
// o padrão inseguro silencioso. O CONTRATO da tela exige o prazo; quem
// quiser fechar sem prazo (uso interno, não a tela) chama o service
// direto.
export const validityTermSchema = z.discriminatedUnion('unit', [
  z.object({ unit: z.literal('DAYS'), amount: z.number().int().positive() }),
  z.object({ unit: z.literal('MONTHS'), amount: z.number().int().positive() }),
]);

export const closeQuoteSchema = z.object({
  validityTerm: validityTermSchema,
});

export type CloseQuoteInput = z.infer<typeof closeQuoteSchema>;
