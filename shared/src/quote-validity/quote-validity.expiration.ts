/**
 * Predicado puro de expiração — recebe a data de referência como
 * parâmetro, nunca lê o relógio por dentro (é o que permite teste
 * determinístico).
 *
 * Só compara datas: a regra completa de "expirada" (preço fechado, sem
 * desfecho, validUntil já passado) mora no backend (QuoteService), que
 * é quem sabe o status — este pacote não conhece QuoteStatus.
 *
 * Sem validUntil (cotação sem prazo combinado), nunca expira.
 */
export function isQuoteValidityExpired(
  validUntil: Date | null,
  referenceDate: Date,
): boolean {
  if (validUntil === null) {
    return false;
  }
  return referenceDate.getTime() > validUntil.getTime();
}
