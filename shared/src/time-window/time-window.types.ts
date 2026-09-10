/**
 * Janela de tempo em linguagem natural — não é `timestamptz` nem `date`, é um
 * intervalo com precisão declarada (docs/decisoes.md, pendências técnicas).
 *
 * A precisão (exata / faixa / só início / só fim / período do dia / dia inteiro)
 * é DERIVADA dos campos abaixo, nunca armazenada — ver `precisionOf` em
 * `./time-window.precision.ts`.
 */
export type TimeWindow = {
  /** Data em ISO local, `YYYY-MM-DD`. */
  date: string;
  /** `HH:mm`, ou `null` quando não há horário de início. */
  startTime: string | null;
  /** `HH:mm`, ou `null` quando não há horário de fim. */
  endTime: string | null;
  /** `true` quando `endTime` cai no dia seguinte a `date` (janela cruza meia-noite). */
  endsNextDay: boolean;
  /** Código do período do dia (ver `DayPeriodCode`), ou `null`. */
  dayPeriodCode: string | null;
  /**
   * Texto original, preservado sempre que o parser não conseguiu estruturar
   * (ou estruturou só parcialmente) o que o operador digitou.
   */
  note: string | null;
};

/**
 * Períodos do dia reconhecidos pelo parser. O rótulo em português (label) não
 * mora aqui — vive na tabela de domínio (próxima unidade); este módulo só
 * carrega o código.
 */
export const DAY_PERIOD_CODES = [
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'FIRST_HOUR',
  'END_OF_DAY',
  'MIDDAY',
  'LATE_MORNING',
  'EARLY_AFTERNOON',
  'ALL_DAY',
] as const;

export type DayPeriodCode = (typeof DAY_PERIOD_CODES)[number];

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Valida as invariantes de `TimeWindow`. Retorna a lista de violações
 * (mensagens em português, uma por invariante quebrada) — lista vazia
 * significa objeto válido.
 *
 * Não lança: quem monta um `TimeWindow` fora do parser (testes, futura tela)
 * decide o que fazer com as violações.
 */
export function validateTimeWindow(w: TimeWindow): string[] {
  const errors: string[] = [];

  if (w.startTime !== null && !TIME_PATTERN.test(w.startTime)) {
    errors.push(`startTime inválido: "${w.startTime}" (esperado HH:mm, 00:00–23:59)`);
  }
  if (w.endTime !== null && !TIME_PATTERN.test(w.endTime)) {
    errors.push(`endTime inválido: "${w.endTime}" (esperado HH:mm, 00:00–23:59)`);
  }
  if (w.endTime === '24:00') {
    errors.push('endTime nunca pode ser "24:00" — meia-noite é "00:00" com endsNextDay');
  }

  if (w.dayPeriodCode !== null) {
    if (w.startTime !== null || w.endTime !== null) {
      errors.push('dayPeriodCode preenchido exige startTime e endTime nulos');
    }
    if (w.endsNextDay) {
      errors.push('dayPeriodCode preenchido exige endsNextDay falso');
    }
  }

  if (w.endsNextDay) {
    if (w.startTime === null || w.endTime === null) {
      errors.push('endsNextDay verdadeiro exige startTime e endTime preenchidos');
    } else if (TIME_PATTERN.test(w.startTime) && TIME_PATTERN.test(w.endTime)) {
      if (!(toMinutes(w.endTime) < toMinutes(w.startTime))) {
        errors.push('endsNextDay verdadeiro exige endTime < startTime');
      }
    }
  } else if (w.startTime !== null && w.endTime !== null) {
    if (TIME_PATTERN.test(w.startTime) && TIME_PATTERN.test(w.endTime)) {
      if (!(toMinutes(w.endTime) >= toMinutes(w.startTime))) {
        errors.push('endsNextDay falso com os dois horários preenchidos exige endTime >= startTime');
      }
    }
  }

  return errors;
}

/** Conveniência sobre `validateTimeWindow` — `true` quando não há violação. */
export function isValidTimeWindow(w: TimeWindow): boolean {
  return validateTimeWindow(w).length === 0;
}
