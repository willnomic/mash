import { Prisma } from '@prisma/client';

// Não precisa de banco — demonstra o comportamento do tipo Decimal em si
// (D-013). Roda como teste unitário rápido (npm test), não e2e.
describe('FreightRate · Decimal nunca usa operador nativo (D-013)', () => {
  it('operador nativo (+) concatena string em vez de somar', () => {
    const rate = new Prisma.Decimal('150.5');
    const additional = new Prisma.Decimal('10.25');

    // @ts-expect-error — demonstração deliberada do bug que D-013 alerta:
    // Decimal é objeto, "+" cai para toString() e concatena.
    const wrong = rate + additional;

    expect(wrong).toBe('150.510.25');
    expect(typeof wrong).toBe('string');
  });

  it('.plus() soma corretamente', () => {
    const rate = new Prisma.Decimal('150.5');
    const additional = new Prisma.Decimal('10.25');

    const correct = rate.plus(additional);

    expect(correct.toString()).toBe('160.75');
  });

  it('.times() multiplica corretamente (ex.: tarifa x percentual)', () => {
    const rate = new Prisma.Decimal('150.5');
    const percentage = new Prisma.Decimal('0.025'); // 2,5%

    const additionalValue = rate.times(percentage);

    expect(additionalValue.toString()).toBe('3.7625');
  });
});
