import { precisionOf } from './time-window.precision.js';
import type { TimeWindow } from './time-window.types.js';

function toDdMm(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function toHm(time: string): string {
  const [h, m] = time.split(':');
  return `${h}h${m}`;
}

/**
 * Formata uma `TimeWindow` em português (D-008), para tela e PDF.
 *
 * `dayPeriodLabel` é o rótulo já traduzido do período do dia (quando
 * `dayPeriodCode` estiver preenchido) — este módulo não guarda tradução, ela
 * vem da tabela de domínio (próxima unidade). Sem rótulo informado, cai no
 * próprio código como texto de saída degradado (nunca lança).
 */
export function formatTimeWindow(w: TimeWindow, dayPeriodLabel?: string): string {
  const dd = toDdMm(w.date);
  const precision = precisionOf(w);

  switch (precision) {
    case 'RANGE': {
      const range = `${dd}, das ${toHm(w.startTime as string)} às ${toHm(w.endTime as string)}`;
      return w.endsNextDay ? `${range} do dia seguinte` : range;
    }
    case 'EXACT':
      return `${dd}, às ${toHm(w.startTime as string)}`;
    case 'UNTIL':
      return `${dd}, até as ${toHm(w.endTime as string)}`;
    case 'FROM':
      return `${dd}, a partir das ${toHm(w.startTime as string)}`;
    case 'PERIOD':
      return `${dd}, ${dayPeriodLabel ?? w.dayPeriodCode}`;
    case 'DAY':
      return dd;
  }
}
