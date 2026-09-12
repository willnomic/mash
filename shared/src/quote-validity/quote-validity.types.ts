/**
 * Prazo de validade de uma cotação, em dias, meses ou anos corridos a
 * partir da data de fechamento (unidade "configuração do tenant —
 * prazo padrão de validade da cotação"). "1 ano" é tratado como 12
 * meses, com a MESMA regra de grudar no último dia do mês
 * (computeQuoteValidUntil) — não uma regra de calendário separada.
 */
export type QuoteValidityTerm =
  | { unit: 'DAYS'; amount: number }
  | { unit: 'MONTHS'; amount: number }
  | { unit: 'YEARS'; amount: number };

/**
 * Decisão de validade — nunca omissão (unidade "configuração do
 * tenant"). "NEVER" é escolha EXPLÍCITA de que a cotação não vence,
 * distinta de "ninguém decidiu ainda" (que não tem representação aqui:
 * a ausência de uma QuoteValidityDecision, não um valor dela, é o que
 * significa "o operador digita toda vez" — ver TenantSettings).
 */
export type QuoteValidityDecision =
  | { type: 'TERM'; term: QuoteValidityTerm }
  | { type: 'NEVER' };
