import { formatTimeWindow, parseTimeWindow, precisionOf } from '@mash/shared';

// Prova que `@mash/shared` resolve corretamente pelo npm workspace a partir
// do backend (não é lógica de negócio do backend — é o teste de fiação do
// pacote compartilhado). Cobertura real do parser/formatter vive em
// `shared/src/time-window/*.spec.ts`.
describe('@mash/shared — resolução via npm workspace', () => {
  it('importa e usa parseTimeWindow/formatTimeWindow/precisionOf', () => {
    const window = parseTimeWindow('08/01 - 08H00', 2025);
    expect(precisionOf(window)).toBe('EXACT');
    expect(formatTimeWindow(window)).toBe('08/01, às 08h00');
  });
});
