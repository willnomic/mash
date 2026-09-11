/**
 * Prazo de validade de uma cotação, em dias ou meses corridos a partir
 * da data de fechamento.
 */
export type QuoteValidityTerm =
  | { unit: 'DAYS'; amount: number }
  | { unit: 'MONTHS'; amount: number };
