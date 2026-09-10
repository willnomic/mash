import { describe, expect, it } from 'vitest';
import { type TimeWindow, isValidTimeWindow, validateTimeWindow } from './time-window.types.js';

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

describe('validateTimeWindow', () => {
  it('aceita uma janela DAY (nada preenchido)', () => {
    expect(validateTimeWindow(base())).toEqual([]);
  });

  it('aceita uma janela EXACT (início == fim)', () => {
    const w = base({ startTime: '08:00', endTime: '08:00' });
    expect(validateTimeWindow(w)).toEqual([]);
  });

  it('aceita uma janela RANGE normal (fim >= início, mesmo dia)', () => {
    const w = base({ startTime: '00:00', endTime: '02:00' });
    expect(validateTimeWindow(w)).toEqual([]);
  });

  it('aceita uma janela PERIOD (só dayPeriodCode)', () => {
    expect(validateTimeWindow(base({ dayPeriodCode: 'MORNING' }))).toEqual([]);
  });

  it('aceita uma janela cruzando meia-noite (endsNextDay true, endTime < startTime)', () => {
    const w = base({ startTime: '22:00', endTime: '00:00', endsNextDay: true });
    expect(validateTimeWindow(w)).toEqual([]);
  });

  it('rejeita dayPeriodCode preenchido junto com startTime', () => {
    const w = base({ dayPeriodCode: 'MORNING', startTime: '08:00' });
    expect(validateTimeWindow(w)).not.toEqual([]);
  });

  it('rejeita dayPeriodCode preenchido junto com endTime', () => {
    const w = base({ dayPeriodCode: 'MORNING', endTime: '08:00' });
    expect(validateTimeWindow(w)).not.toEqual([]);
  });

  it('rejeita dayPeriodCode preenchido junto com endsNextDay verdadeiro', () => {
    const w = base({
      dayPeriodCode: 'MORNING',
      startTime: '22:00',
      endTime: '00:00',
      endsNextDay: true,
    });
    expect(validateTimeWindow(w)).not.toEqual([]);
  });

  it('rejeita endsNextDay verdadeiro sem startTime', () => {
    const w = base({ endTime: '00:00', endsNextDay: true });
    expect(validateTimeWindow(w)).not.toEqual([]);
  });

  it('rejeita endsNextDay verdadeiro sem endTime', () => {
    const w = base({ startTime: '22:00', endsNextDay: true });
    expect(validateTimeWindow(w)).not.toEqual([]);
  });

  it('rejeita endsNextDay verdadeiro com endTime >= startTime', () => {
    const w = base({ startTime: '10:00', endTime: '12:00', endsNextDay: true });
    expect(validateTimeWindow(w)).not.toEqual([]);
  });

  it('rejeita endsNextDay falso com endTime < startTime', () => {
    const w = base({ startTime: '12:00', endTime: '10:00', endsNextDay: false });
    expect(validateTimeWindow(w)).not.toEqual([]);
  });

  it('rejeita endTime "24:00"', () => {
    const w = base({ startTime: '22:00', endTime: '24:00', endsNextDay: false });
    expect(validateTimeWindow(w)).not.toEqual([]);
  });

  it('isValidTimeWindow espelha validateTimeWindow', () => {
    expect(isValidTimeWindow(base())).toBe(true);
    expect(isValidTimeWindow(base({ endTime: '24:00', startTime: '22:00' }))).toBe(false);
  });
});
