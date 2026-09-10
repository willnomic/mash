import { describe, expect, it } from 'vitest';
import { parseTimeWindow } from './time-window.parser.js';
import { precisionOf } from './time-window.precision.js';
import { validateTimeWindow } from './time-window.types.js';

const YEAR = 2025;

describe('parseTimeWindow — formas confirmadas em dado real', () => {
  it('faixa: "03/02 - 00H00 A 02H00"', () => {
    const w = parseTimeWindow('03/02 - 00H00 A 02H00', YEAR);
    expect(w).toEqual({
      date: '2025-02-03',
      startTime: '00:00',
      endTime: '02:00',
      endsNextDay: false,
      dayPeriodCode: null,
      note: null,
    });
    expect(precisionOf(w)).toBe('RANGE');
  });

  it('exato: "08/01 - 08H00"', () => {
    const w = parseTimeWindow('08/01 - 08H00', YEAR);
    expect(w).toEqual({
      date: '2025-01-08',
      startTime: '08:00',
      endTime: '08:00',
      endsNextDay: false,
      dayPeriodCode: null,
      note: null,
    });
    expect(precisionOf(w)).toBe('EXACT');
  });

  it('só fim: "05/05 - ATÉ AS 17H30"', () => {
    const w = parseTimeWindow('05/05 - ATÉ AS 17H30', YEAR);
    expect(w).toEqual({
      date: '2025-05-05',
      startTime: null,
      endTime: '17:30',
      endsNextDay: false,
      dayPeriodCode: null,
      note: null,
    });
    expect(precisionOf(w)).toBe('UNTIL');
  });

  it('só início: "03/11 - A PARTIR DAS 13H00"', () => {
    const w = parseTimeWindow('03/11 - A PARTIR DAS 13H00', YEAR);
    expect(w).toEqual({
      date: '2025-11-03',
      startTime: '13:00',
      endTime: null,
      endsNextDay: false,
      dayPeriodCode: null,
      note: null,
    });
    expect(precisionOf(w)).toBe('FROM');
  });

  it('só início, sinônimo "APÓS AS": "01/06 - APÓS AS 17H00"', () => {
    const w = parseTimeWindow('01/06 - APÓS AS 17H00', YEAR);
    expect(w).toEqual({
      date: '2025-06-01',
      startTime: '17:00',
      endTime: null,
      endsNextDay: false,
      dayPeriodCode: null,
      note: null,
    });
    expect(precisionOf(w)).toBe('FROM');
  });

  it('período: "08/01 - PELA MANHÃ"', () => {
    const w = parseTimeWindow('08/01 - PELA MANHÃ', YEAR);
    expect(w).toEqual({
      date: '2025-01-08',
      startTime: null,
      endTime: null,
      endsNextDay: false,
      dayPeriodCode: 'MORNING',
      note: null,
    });
    expect(precisionOf(w)).toBe('PERIOD');
  });

  it('data crua do Excel sem hora: "2025-07-03 00:00:00"', () => {
    const w = parseTimeWindow('2025-07-03 00:00:00', YEAR);
    expect(w).toEqual({
      date: '2025-07-03',
      startTime: null,
      endTime: null,
      endsNextDay: false,
      dayPeriodCode: null,
      note: null,
    });
    expect(precisionOf(w)).toBe('DAY');
  });

  it('data crua do Excel, só a data (sem hora nenhuma): "2025-07-03"', () => {
    const w = parseTimeWindow('2025-07-03', YEAR);
    expect(w).toEqual({
      date: '2025-07-03',
      startTime: null,
      endTime: null,
      endsNextDay: false,
      dayPeriodCode: null,
      note: null,
    });
  });

  it('cruza meia-noite: "13/01 - 22H00 A 00H00"', () => {
    const w = parseTimeWindow('13/01 - 22H00 A 00H00', YEAR);
    expect(w).toEqual({
      date: '2025-01-13',
      startTime: '22:00',
      endTime: '00:00',
      endsNextDay: true,
      dayPeriodCode: null,
      note: null,
    });
    expect(precisionOf(w)).toBe('RANGE');
  });
});

describe('parseTimeWindow — os seis períodos do dia, confirmados em dado real', () => {
  it.each([
    ['06/06 - DE MANHA', 'MORNING'],
    ['04/08 - PELA MANHA', 'MORNING'], // sem acento — convive com "PELA MANHÃ" no mesmo dado real
    ['03/02 - PELA TARDE', 'AFTERNOON'],
    ['17/10 - A NOITE', 'EVENING'],
    ['07/01 - PELA NOITE', 'EVENING'],
    ['06/02 - PRIMEIRA HORA DA MANHÃ', 'FIRST_HOUR'],
    ['25/02 - FINAL DA TARDE', 'END_OF_DAY'],
    ['19/11 - MEIO DIA', 'MIDDAY'],
  ] as const)('%s -> dayPeriodCode %s', (raw, code) => {
    const w = parseTimeWindow(raw, YEAR);
    expect(w.dayPeriodCode).toBe(code);
    expect(w.note).toBeNull();
    expect(precisionOf(w)).toBe('PERIOD');
  });
});

describe('parseTimeWindow — horário explícito ganha de período nomeado (dado real misto)', () => {
  it('"05/02 - FINAL DA TARDE APÓS AS 18H00" -> FROM 18:00, período vira note', () => {
    const raw = '05/02 - FINAL DA TARDE APÓS AS 18H00';
    const w = parseTimeWindow(raw, YEAR);
    expect(w).toEqual({
      date: '2025-02-05',
      startTime: '18:00',
      endTime: null,
      endsNextDay: false,
      dayPeriodCode: null,
      note: raw,
    });
    expect(precisionOf(w)).toBe('FROM');
    expect(validateTimeWindow(w)).toEqual([]);
  });

  it('"11/02 - FINAL DA TARDE (ATÉ AS 17H00)" -> UNTIL 17:00, período vira note', () => {
    const raw = '11/02 - FINAL DA TARDE (ATÉ AS 17H00)';
    const w = parseTimeWindow(raw, YEAR);
    expect(w).toEqual({
      date: '2025-02-11',
      startTime: null,
      endTime: '17:00',
      endsNextDay: false,
      dayPeriodCode: null,
      note: raw,
    });
    expect(precisionOf(w)).toBe('UNTIL');
    expect(validateTimeWindow(w)).toEqual([]);
  });

  it('"15/10 - ATE O MEIO DIA" -> UNTIL 12:00, não MIDDAY', () => {
    const raw = '15/10 - ATE O MEIO DIA';
    const w = parseTimeWindow(raw, YEAR);
    expect(w).toEqual({
      date: '2025-10-15',
      startTime: null,
      endTime: '12:00',
      endsNextDay: false,
      dayPeriodCode: null,
      note: null, // nada sobra ao redor — "meio dia" É o horário, não um período junto de um horário
    });
    expect(precisionOf(w)).toBe('UNTIL');
    expect(validateTimeWindow(w)).toEqual([]);
  });
});

describe('parseTimeWindow — normalização e casos de borda', () => {
  it('usa o referenceYear passado, o texto nunca traz ano', () => {
    const w = parseTimeWindow('08/01 - 08H00', 2030);
    expect(w.date).toBe('2030-01-08');
  });

  it('"24H00" no fim vira "00:00" com endsNextDay (invariante: endTime nunca é 24:00)', () => {
    const w = parseTimeWindow('20/03 - 22H00 A 24H00', YEAR);
    expect(w.endTime).toBe('00:00');
    expect(w.endsNextDay).toBe(true);
    expect(validateTimeWindow(w)).toEqual([]);
  });

  it('nunca lança para entrada vazia', () => {
    expect(() => parseTimeWindow('', YEAR)).not.toThrow();
    const w = parseTimeWindow('', YEAR);
    expect(w).toEqual({
      date: '',
      startTime: null,
      endTime: null,
      endsNextDay: false,
      dayPeriodCode: null,
      note: '',
    });
  });

  it('nunca lança para lixo total, e preserva o texto inteiro em note', () => {
    const raw = 'combinar com o motorista por telefone';
    expect(() => parseTimeWindow(raw, YEAR)).not.toThrow();
    const w = parseTimeWindow(raw, YEAR);
    expect(w.note).toBe(raw);
    expect(w.date).toBe('');
    expect(w.startTime).toBeNull();
    expect(w.endTime).toBeNull();
    expect(w.dayPeriodCode).toBeNull();
  });

  it('data reconhecível com resto não reconhecido: guarda a data e joga o texto inteiro pra note', () => {
    const raw = '10/04 - combinar direto com o motorista';
    const w = parseTimeWindow(raw, YEAR);
    expect(w.date).toBe('2025-04-10');
    expect(w.note).toBe(raw);
    expect(w.startTime).toBeNull();
    expect(w.endTime).toBeNull();
    expect(w.dayPeriodCode).toBeNull();
  });

  it('mês implausível (> 12) não é tratado como data — vai inteiro pra note', () => {
    const raw = '10/13 - 08H00';
    const w = parseTimeWindow(raw, YEAR);
    expect(w.date).toBe('');
    expect(w.note).toBe(raw);
  });

  it('produz sempre um objeto válido pelas invariantes, mesmo em fallback', () => {
    const inputs = ['', 'x', '99/99', '10/13 - 08H00', '05/05 - ATÉ AS 25H99'];
    for (const input of inputs) {
      const w = parseTimeWindow(input, YEAR);
      expect(validateTimeWindow(w)).toEqual([]);
    }
  });
});
