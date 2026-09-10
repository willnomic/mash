import { describe, expect, it } from 'vitest';
import { formatTimeWindow } from './time-window.formatter.js';
import type { TimeWindow } from './time-window.types.js';

function base(overrides: Partial<TimeWindow> = {}): TimeWindow {
  return {
    date: '2025-03-02',
    startTime: null,
    endTime: null,
    endsNextDay: false,
    dayPeriodCode: null,
    note: null,
    ...overrides,
  };
}

describe('formatTimeWindow', () => {
  it('faixa: "03/02, das 00h00 às 02h00"', () => {
    const w = base({ date: '2025-02-03', startTime: '00:00', endTime: '02:00' });
    expect(formatTimeWindow(w)).toBe('03/02, das 00h00 às 02h00');
  });

  it('exato: "08/01, às 08h00"', () => {
    const w = base({ date: '2025-01-08', startTime: '08:00', endTime: '08:00' });
    expect(formatTimeWindow(w)).toBe('08/01, às 08h00');
  });

  it('só fim: "05/05, até as 17h30"', () => {
    const w = base({ date: '2025-05-05', endTime: '17:30' });
    expect(formatTimeWindow(w)).toBe('05/05, até as 17h30');
  });

  it('só início: "03/11, a partir das 13h00"', () => {
    const w = base({ date: '2025-11-03', startTime: '13:00' });
    expect(formatTimeWindow(w)).toBe('03/11, a partir das 13h00');
  });

  it('período, com rótulo vindo de fora: "08/01, pela manhã"', () => {
    const w = base({ date: '2025-01-08', dayPeriodCode: 'MORNING' });
    expect(formatTimeWindow(w, 'pela manhã')).toBe('08/01, pela manhã');
  });

  it('período sem rótulo informado cai no próprio código (degradado, nunca lança)', () => {
    const w = base({ date: '2025-01-08', dayPeriodCode: 'MORNING' });
    expect(formatTimeWindow(w)).toBe('08/01, MORNING');
  });

  it('faixa cruzando meia-noite: "13/01, das 22h00 às 00h00 do dia seguinte"', () => {
    const w = base({
      date: '2025-01-13',
      startTime: '22:00',
      endTime: '00:00',
      endsNextDay: true,
    });
    expect(formatTimeWindow(w)).toBe('13/01, das 22h00 às 00h00 do dia seguinte');
  });

  it('dia inteiro: "03/07"', () => {
    const w = base({ date: '2025-07-03' });
    expect(formatTimeWindow(w)).toBe('03/07');
  });
});
