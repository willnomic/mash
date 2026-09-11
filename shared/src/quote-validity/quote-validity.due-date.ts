import type { QuoteValidityTerm } from './quote-validity.types.js';

/**
 * Calcula o vencimento (validUntil) de uma cotação a partir da data de
 * fechamento e de um prazo em dias ou meses corridos.
 *
 * Em meses, quando o dia não existe no mês de destino, gruda no último
 * dia do mês de destino (31/01 + 1 mês = 28/02, 29/02 em bissexto) —
 * nunca "estoura" pro mês seguinte.
 *
 * Trabalha em UTC: referenceDate e o retorno são datas de calendário
 * (D-016 — sem hora, sem fuso). Usar getters/setters locais moveria a
 * data em um dia perto da meia-noite dependendo do fuso da máquina.
 */
export function computeQuoteValidUntil(
  referenceDate: Date,
  term: QuoteValidityTerm,
): Date {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const day = referenceDate.getUTCDate();

  if (term.unit === 'DAYS') {
    return new Date(Date.UTC(year, month, day + term.amount));
  }

  const targetMonth = month + term.amount;
  // Dia 0 do mês seguinte ao alvo = último dia do mês alvo.
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, targetMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(Date.UTC(year, targetMonth, clampedDay));
}
