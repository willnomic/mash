import { describe, expect, it } from 'vitest';
import { precisionOf } from './time-window.precision.js';
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

describe('precisionOf', () => {
  it('DAY quando nada está preenchido', () => {
    expect(precisionOf(base())).toBe('DAY');
  });

  it('PERIOD quando dayPeriodCode está preenchido', () => {
    expect(precisionOf(base({ dayPeriodCode: 'MORNING' }))).toBe('PERIOD');
  });

  it('FROM quando só startTime está preenchido', () => {
    expect(precisionOf(base({ startTime: '13:00' }))).toBe('FROM');
  });

  it('UNTIL quando só endTime está preenchido', () => {
    expect(precisionOf(base({ endTime: '17:30' }))).toBe('UNTIL');
  });

  it('EXACT quando startTime == endTime e não cruza meia-noite', () => {
    expect(precisionOf(base({ startTime: '08:00', endTime: '08:00' }))).toBe('EXACT');
  });

  it('RANGE quando startTime != endTime, mesmo dia', () => {
    expect(precisionOf(base({ startTime: '00:00', endTime: '02:00' }))).toBe('RANGE');
  });

  it('RANGE quando cruza meia-noite, mesmo com endsNextDay true', () => {
    const w = base({ startTime: '22:00', endTime: '00:00', endsNextDay: true });
    expect(precisionOf(w)).toBe('RANGE');
  });
});
