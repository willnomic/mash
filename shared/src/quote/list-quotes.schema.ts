import { z } from 'zod';

// Seis estados da tela (unidade "configuração do tenant" acrescenta o
// sexto) — quatro são o QuoteStatus.code real
// (OPEN/CLOSED/ACCEPTED/REJECTED); CLOSED_EXPIRED e CLOSED_NO_EXPIRY
// são valores de FILTRO, nunca gravados (D-046: a expiração é
// derivada — preço fechado, sem desfecho, validUntil passado ou nulo).
// O backend traduz:
//   CLOSED             → statusId=CLOSED AND validUntil >= hoje (tem prazo, válida)
//   CLOSED_EXPIRED     → statusId=CLOSED AND validUntil < hoje (tem prazo, vencida)
//   CLOSED_NO_EXPIRY   → statusId=CLOSED AND validUntil IS NULL ("não vence", decisão explícita)
// validUntil nulo nunca cai em CLOSED nem em CLOSED_EXPIRED por
// acidente — é o próprio ponto desta unidade: antes, nulo caía junto
// com "válida" (mesmo balde), escondendo que a cotação nunca vence.
export const QUOTE_LIST_STATUS_FILTERS = [
  'OPEN',
  'CLOSED',
  'CLOSED_EXPIRED',
  'CLOSED_NO_EXPIRY',
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
