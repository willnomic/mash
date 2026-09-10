import type { TimeWindow } from './time-window.types.js';

/**
 * EXACT  — início == fim (um instante, ex. "às 08h00")
 * RANGE  — início e fim diferentes (inclui janelas que cruzam meia-noite)
 * UNTIL  — só fim (ex. "até as 17h30")
 * FROM   — só início (ex. "a partir das 13h00")
 * PERIOD — só período do dia (ex. "pela manhã")
 * DAY    — nada além da data
 */
export type TimeWindowPrecision = 'EXACT' | 'RANGE' | 'UNTIL' | 'FROM' | 'PERIOD' | 'DAY';

/**
 * Deriva a precisão de uma janela. Função pura — a precisão nunca é
 * armazenada, sempre recalculada a partir de `startTime`/`endTime`/
 * `dayPeriodCode`.
 */
export function precisionOf(w: TimeWindow): TimeWindowPrecision {
  if (w.dayPeriodCode !== null) {
    return 'PERIOD';
  }
  if (w.startTime !== null && w.endTime !== null) {
    return w.startTime === w.endTime && !w.endsNextDay ? 'EXACT' : 'RANGE';
  }
  if (w.startTime !== null) {
    return 'FROM';
  }
  if (w.endTime !== null) {
    return 'UNTIL';
  }
  return 'DAY';
}
