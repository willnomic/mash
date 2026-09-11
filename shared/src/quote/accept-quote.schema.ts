import { z } from 'zod';

// Espelha OrderParties (backend/src/order/order.service.ts) — os quatro
// campos que accept() exige de fora, porque Quote no caminho CUSTO não
// guarda cliente nem filial (D-047). customerReference vazio normaliza
// pra undefined (mesmo achado da parte 1: campo de formulário vazio
// manda "", não undefined).
export const acceptQuoteSchema = z.object({
  branchId: z.string().uuid('Filial inválida'),
  senderId: z.string().uuid('Remetente inválido'),
  recipientId: z.string().uuid('Destinatário inválido'),
  tomadorId: z.string().uuid('Tomador inválido'),
  customerReference: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
});

export type AcceptQuoteInput = z.infer<typeof acceptQuoteSchema>;
