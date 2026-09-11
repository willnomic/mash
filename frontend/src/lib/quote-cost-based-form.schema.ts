import { z } from 'zod'
import {
  createCostBasedQuoteSchema,
  quoteCostLineInputSchema,
  moneyAmountSchema,
  marginPercentageSchema,
} from '@mash/shared'
import { parseBrDecimalToApi } from './br-number'

// Schema de formulário DERIVADO do contrato (D-048, item 1) — nunca
// reescrito. .extend() troca só os campos de DINHEIRO/PERCENTUAL pela
// representação mascarada em pt-BR ("2.800,00" em vez de Decimal em
// string canônica, "2800.00"); cada um valida o RESULTADO da conversão
// com `.pipe()` contra o schema exportado por @mash/shared — a regra em
// si (quantas casas decimais, maior que zero, menor que 100%) mora só
// lá, nunca duplicada aqui.
//
// Por que .pipe() no CAMPO, não no objeto inteiro: `.pipe()` do objeto
// completo exige que o tipo de ENTRADA do schema de destino bata
// estruturalmente com a saída do `.transform()` — e o campo opcional
// `description` (que já passa por normalização própria dentro de
// quoteCostLineInputSchema, "" vira undefined) faz o TypeScript inferir
// a chave como opcional num lugar e obrigatória-mas-undefined no outro,
// e as duas formas não conciliam. Validar campo a campo evita o
// problema E é mais preciso: só o que de fato mudou de formato precisa
// ser revalidado.
const costLineFormSchema = quoteCostLineInputSchema.extend({
  amount: z
    .string()
    .min(1, 'Informe o valor')
    .transform(parseBrDecimalToApi)
    .pipe(moneyAmountSchema),
})

export const quoteCostBasedFormSchema = createCostBasedQuoteSchema.extend({
  marginPercentage: z
    .string()
    .min(1, 'Informe a margem')
    .transform(parseBrDecimalToApi)
    .pipe(marginPercentageSchema),
  costLines: z
    .array(costLineFormSchema)
    .min(1, 'Adicione ao menos uma linha de custo'),
})

// Tipo de ENTRADA (o que o formulário guarda enquanto o operador digita
// — strings mascaradas) e de SAÍDA (o que vai no POST, já no formato do
// contrato) são diferentes de propósito — react-hook-form + zodResolver
// tratam os dois lados (useForm usa o de entrada; handleSubmit devolve o
// de saída).
export type QuoteCostBasedFormValues = z.input<typeof quoteCostBasedFormSchema>
export type QuoteCostBasedFormOutput = z.output<
  typeof quoteCostBasedFormSchema
>
