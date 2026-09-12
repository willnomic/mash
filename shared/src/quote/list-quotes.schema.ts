import { z } from 'zod';

// Cinco estados da tela (unidade "lista de cotações", D-046/D-051) —
// quatro são o QuoteStatus.code real (OPEN/CLOSED/ACCEPTED/REJECTED);
// CLOSED_EXPIRED é só um valor de FILTRO, nunca gravado (D-046: a
// expiração é derivada — preço fechado, sem desfecho, validUntil
// passado). O backend traduz CLOSED_EXPIRED em
// "statusId=CLOSED AND validUntil < hoje", e CLOSED (sem o "_EXPIRED")
// passa a significar só a fatia válida — não o status bruto do banco.
export const QUOTE_LIST_STATUS_FILTERS = [
  'OPEN',
  'CLOSED',
  'CLOSED_EXPIRED',
  'ACCEPTED',
  'REJECTED',
] as const;

export type QuoteListStatusFilter = (typeof QUOTE_LIST_STATUS_FILTERS)[number];

// Compartilhado entre o backend (valida req.query, string sempre) e o
// frontend (valida/tipa o search da rota, TanStack Router já entrega
// number quando a URL tem "page=2") — z.coerce.number() aceita as duas
// formas sem duplicar o schema (D-021, item "mesma definição, dois
// lados").
//
// pageSize é FIXO (não é campo de formulário nesta unidade — não foi
// pedido seletor de tamanho de página): o max aqui é só um teto de
// segurança contra URL editada à mão, não um controle de UI.
export const listQuotesQuerySchema = z.object({
  status: z.enum(QUOTE_LIST_STATUS_FILTERS).optional(),
  partyId: z.string().uuid('Cliente inválido').optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQuotesQuery = z.infer<typeof listQuotesQuerySchema>;
