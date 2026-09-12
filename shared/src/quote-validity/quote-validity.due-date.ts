import type { QuoteValidityTerm } from './quote-validity.types.js';

/**
 * Calcula o vencimento (validUntil) de uma cotação a partir da data de
 * fechamento e de um prazo em dias, meses ou anos corridos (unidade
 * "configuração do tenant").
 *
 * Em meses E em anos, quando o dia não existe no mês de destino, gruda
 * no último dia do mês de destino (31/01 + 1 mês = 28/02, 29/02 em
 * bissexto) — nunca "estoura" pro mês seguinte. "1 ano" é literalmente
 * 12 meses somados pela MESMA conta — não existe regra de calendário
 * separada pra ano: 29/02/2028 + 1 ano vira 28/02/2029 (2029 não é
 * bissexto), pelo mesmo motivo que 31/01 + 1 mês vira 28/02.
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

  const monthsToAdd = term.unit === 'YEARS' ? term.amount * 12 : term.amount;
  const targetMonth = month + monthsToAdd;
  // Dia 0 do mês seguinte ao alvo = último dia do mês alvo.
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, targetMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(Date.UTC(year, targetMonth, clampedDay));
}
