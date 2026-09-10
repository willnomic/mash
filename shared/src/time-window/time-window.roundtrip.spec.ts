import { describe, expect, it } from 'vitest';
import { formatTimeWindow } from './time-window.formatter.js';
import { parseTimeWindow } from './time-window.parser.js';

const YEAR = 2025;

// parse -> format -> parse deve produzir o mesmo objeto, para as formas
// canônicas confirmadas em dado real. O rótulo de período é fornecido aqui
// só para o teste — a tradução vive na tabela de domínio (próxima unidade),
// não neste pacote.
const CANONICAL_INPUTS: Array<{ raw: string; dayPeriodLabel?: string }> = [
  { raw: '03/02 - 00H00 A 02H00' }, // RANGE
  { raw: '08/01 - 08H00' }, // EXACT
  { raw: '05/05 - ATÉ AS 17H30' }, // UNTIL
  { raw: '03/11 - A PARTIR DAS 13H00' }, // FROM ("a partir das")
  { raw: '01/06 - APÓS AS 17H00' }, // FROM ("após as")
  { raw: '08/01 - PELA MANHÃ', dayPeriodLabel: 'pela manhã' }, // PERIOD
  { raw: '2025-07-03 00:00:00' }, // DAY (data crua do Excel)
  { raw: '13/01 - 22H00 A 00H00' }, // RANGE cruzando meia-noite
];

describe('parseTimeWindow -> formatTimeWindow -> parseTimeWindow', () => {
  for (const { raw, dayPeriodLabel } of CANONICAL_INPUTS) {
    it(`ida e volta preserva o objeto: "${raw}"`, () => {
      const first = parseTimeWindow(raw, YEAR);
      const formatted = formatTimeWindow(first, dayPeriodLabel);
      const second = parseTimeWindow(formatted, YEAR);
      expect(second).toEqual(first);
    });
  }
});
