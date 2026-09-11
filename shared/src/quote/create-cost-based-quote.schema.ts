import { z } from 'zod';
import { BRAZILIAN_STATE_CODES } from '../brazil/uf.js';

// Contrato de criação do rascunho de cotação por custo (unidade
// "primeira tela de negócio", parte 1 — D-041/D-046/D-048). Backend
// valida no controller, frontend valida no formulário: mesma definição,
// as duas bordas (D-048, item 1).
//
// Dinheiro/percentual sempre como STRING (D-013) — nunca number: Decimal
// do Prisma só aceita string/number, e number reabriria a armadilha de
// ponto flutuante que a D-013 existe pra evitar. A tela mascara em
// pt-BR ("2.800,00"); este schema valida o formato CANÔNICO (ponto
// decimal), a conversão é responsabilidade do schema de formulário
// derivado (frontend/src/lib/quote-cost-based-form.schema.ts), nunca
// deste.

// Escala de QuoteCostLine.amount (D-013: numeric(14,2)) — até 12 dígitos
// inteiros, até 2 decimais, sempre positivo (custo zero ou negativo não
// é custo).
// Exportado (não só interno): o schema de formulário derivado
// (frontend/src/lib/quote-cost-based-form.schema.ts) precisa dele pra
// validar o valor DEPOIS de converter a máscara pt-BR, sem duplicar a
// regra aqui.
export const moneyAmountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Valor inválido')
  .refine((value) => Number(value) > 0, 'Valor precisa ser maior que zero');

// Escala de Quote.marginPercentage (D-013: numeric(7,4)) — até 3 dígitos
// inteiros, até 4 decimais. Sempre < 100: margem "por dentro" (D-041)
// a 100% divide o preço final por zero. >= 0: margem negativa não é
// suportada nesta unidade (vender abaixo do custo é decisão de negócio
// fora de escopo, não validação de formato).
export const marginPercentageSchema = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Margem inválida')
  .refine((value) => Number(value) < 100, 'Margem precisa ser menor que 100%');

// Achado em teste real de navegador: `.optional()` só dispensa a
// validação quando o valor é `undefined` — um campo de formulário vazio
// manda `""`, não `undefined`, e `.min(1)` rejeitava isso (o operador
// não conseguia deixar a descrição em branco, mesmo sendo opcional).
// `.transform()` resolve na entrada: string vazia/só espaço vira
// `undefined` antes de qualquer outra validação rodar.
const optionalDescriptionSchema = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

export const quoteCostLineInputSchema = z.object({
  costTypeId: z.string().uuid('Tipo de custo inválido'),
  description: optionalDescriptionSchema,
  amount: moneyAmountSchema,
});

export const createCostBasedQuoteSchema = z.object({
  // Quem PEDIU a cotação (unidade "vincular cliente à Quote") — NOT
  // NULL no banco (Quote.partyId), exigido aqui pelo mesmo motivo:
  // cotação sem saber de quem é não serve pra nada. Não é remetente/
  // destinatário/tomador fiscal (esses entram no aceite, D-047) — só
  // quem o operador troca e-mail.
  partyId: z.string().uuid('Cliente inválido'),
  icmsUf: z.enum(BRAZILIAN_STATE_CODES, { message: 'UF inválida' }),
  marginPercentage: marginPercentageSchema,
  costLines: z
    .array(quoteCostLineInputSchema)
    .min(1, 'Adicione ao menos uma linha de custo'),
});

export type QuoteCostLineInput = z.infer<typeof quoteCostLineInputSchema>;
export type CreateCostBasedQuoteInput = z.infer<
  typeof createCostBasedQuoteSchema
>;
