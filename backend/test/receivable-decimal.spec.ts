import { Prisma } from '@prisma/client';

// Não precisa de banco — demonstra o comportamento do tipo Decimal em si
// (D-013), aplicado à soma de eventos do livro de recebíveis (D-042).
// Mesmo critério de freight-rate-decimal.spec.ts.
describe('ReceivableEvent · Decimal nunca usa operador nativo (D-013)', () => {
  it('operador nativo (+) concatena string em vez de somar dois pagamentos', () => {
    const paymentOne = new Prisma.Decimal('200');
    const paymentTwo = new Prisma.Decimal('300');

    // @ts-expect-error — demonstração deliberada: Decimal é objeto, "+"
    // cai pra toString() e concatena.
    const wrong = paymentOne + paymentTwo;

    expect(wrong).toBe('200300');
    expect(typeof wrong).toBe('string');
  });

  it('.plus() soma pagamentos corretamente', () => {
    const paymentOne = new Prisma.Decimal('200');
    const paymentTwo = new Prisma.Decimal('300');

    expect(paymentOne.plus(paymentTwo).toString()).toBe('500');
  });

  it('.minus() reduz o saldo devedor pelo total pago', () => {
    const orderTotal = new Prisma.Decimal('500');
    const totalPaid = new Prisma.Decimal('200');

    expect(orderTotal.minus(totalPaid).toString()).toBe('300');
  });

  it('estorno desfaz o efeito do pagamento na soma sinalizada (.plus() para PAYMENT, .minus() para REVERSAL)', () => {
    const events: { type: 'PAYMENT' | 'REVERSAL'; amount: string }[] = [
      { type: 'PAYMENT', amount: '200' },
      { type: 'REVERSAL', amount: '200' },
    ];

    const received = events.reduce((sum, event) => {
      const amount = new Prisma.Decimal(event.amount);
      return event.type === 'PAYMENT' ? sum.plus(amount) : sum.minus(amount);
    }, new Prisma.Decimal(0));

    expect(received.toString()).toBe('0');
  });
});
