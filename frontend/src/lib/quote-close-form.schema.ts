import { z } from 'zod'
import { validityTermSchema } from '@mash/shared'

// Derivado de validityTermSchema (@mash/shared, D-048 item 1): o prazo
// chega da tela como texto de <input type="number">, o contrato espera
// number inteiro positivo — .transform()+.pipe() converte e valida
// contra o schema original, sem duplicar a regra (>0, inteiro).
const amountFieldSchema = z
  .string()
  .min(1, 'Informe o prazo')
  .transform((value) => Number(value))
  .pipe(z.number().int().positive('Prazo precisa ser maior que zero'))

export const quoteCloseFormSchema = z
  .object({
    unit: z.enum(['DAYS', 'MONTHS']),
    amount: amountFieldSchema,
  })
  .pipe(validityTermSchema)

export type QuoteCloseFormValues = z.input<typeof quoteCloseFormSchema>
export type QuoteCloseFormOutput = z.output<typeof quoteCloseFormSchema>
