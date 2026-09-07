import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { ensureDeductionReasonsSeeded } from './helpers/seed-deduction-reasons.js';
import { seedCarrierHireScenario } from './helpers/seed-carrier-hire-scenario.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia provada
// aqui (congelamento parcial do CarrierHire, livro append-only do
// CarrierPayment, CHECK ligando type a deductionReasonId) é do banco, não
// dá pra mockar.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Espelha a conta que um futuro CarrierHireService vai fazer: saldo nunca
// é coluna (D-017/D-019), sempre soma dos eventos com o sinal de "type".
// Decimal sempre via .plus()/.minus() (D-013) — nunca operador nativo.
function computeBalance(
  agreedFreight: Prisma.Decimal,
  payments: { type: string; grossAmount: Prisma.Decimal }[],
) {
  return payments.reduce((balance, payment) => {
    if (payment.type === 'REVERSAL') return balance.plus(payment.grossAmount);
    return balance.minus(payment.grossAmount);
  }, agreedFreight);
}

describe('CarrierHire/CarrierPayment · contratação de terceiro (D-019)', () => {
  let seed: Awaited<ReturnType<typeof seedCarrierHireScenario>>;
  let hire: { id: string; agreedFreight: Prisma.Decimal };
  let damageReasonId: string;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "CarrierPayment", "CarrierHire", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    await ensureDeductionReasonsSeeded(admin);
    seed = await seedCarrierHireScenario(admin, 'A', 'transportadora-a');
    hire = await forTenant(seed.tenant.id).carrierHire.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        tripId: seed.trip.id,
        thirdPartyId: seed.thirdParty.id,
        agreedFreight: '3000',
      },
    });
    damageReasonId = (
      await admin.deductionReason.findFirstOrThrow({ where: { code: 'DAMAGE' } })
    ).id;
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "CarrierPayment", "CarrierHire", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
    await ensureTripStatusesSeeded(admin);
    await ensureDeductionReasonsSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('impede alterar valor congelado do CarrierHire (agreedFreight)', async () => {
    await expect(
      forTenant(seed.tenant.id).carrierHire.update({
        where: { id: hire.id },
        data: { agreedFreight: '999' },
      }),
    ).rejects.toThrow();
  });

  it('impede trocar o terceiro ou a viagem depois de criada', async () => {
    await expect(
      forTenant(seed.tenant.id).carrierHire.update({
        where: { id: hire.id },
        data: { thirdPartyId: seed.party.id },
      }),
    ).rejects.toThrow();
  });

  it('libera atualizar CIOT depois da contratação', async () => {
    const updated = await forTenant(seed.tenant.id).carrierHire.update({
      where: { id: hire.id },
      data: { ciotNumber: '12345678901234567890123456' },
    });

    expect(updated.ciotNumber).toBe('12345678901234567890123456');
  });

  it('vale-pedágio é registrado como compra separada (D-036) — mais de uma compra na mesma contratação', async () => {
    const tenantPrisma = forTenant(seed.tenant.id);
    const first = await tenantPrisma.tollVoucherPurchase.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        tollVoucherSupplierCnpj: '11444777000161',
        tollVoucherPurchaseNumber: 'VP-001',
        tollVoucherAmount: '450.30',
      },
    });
    const second = await tenantPrisma.tollVoucherPurchase.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        tollVoucherSupplierCnpj: '11444777000161',
        tollVoucherPurchaseNumber: 'VP-002',
        tollVoucherAmount: '120.00',
      },
    });

    expect(first.tollVoucherAmount?.toString()).toBe('450.3');
    expect(second.tollVoucherAmount?.toString()).toBe('120');

    const purchases = await tenantPrisma.tollVoucherPurchase.findMany({
      where: { carrierHireId: hire.id },
    });
    expect(purchases).toHaveLength(2);
  });

  it('vale-pedágio é append-only: impede UPDATE e DELETE', async () => {
    const purchase = await forTenant(seed.tenant.id).tollVoucherPurchase.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        tollVoucherSupplierCnpj: '11444777000161',
        tollVoucherPurchaseNumber: 'VP-001',
        tollVoucherAmount: '450.30',
      },
    });

    await expect(
      forTenant(seed.tenant.id).tollVoucherPurchase.update({
        where: { id: purchase.id },
        data: { tollVoucherAmount: '1' },
      }),
    ).rejects.toThrow();

    await expect(
      forTenant(seed.tenant.id).tollVoucherPurchase.delete({ where: { id: purchase.id } }),
    ).rejects.toThrow();
  });

  it('impede apagar CarrierHire — histórico financeiro nunca se apaga (D-017)', async () => {
    await expect(
      forTenant(seed.tenant.id).carrierHire.delete({ where: { id: hire.id } }),
    ).rejects.toThrow();
  });

  it('CarrierPayment é append-only: impede UPDATE de qualquer coluna', async () => {
    const payment = await forTenant(seed.tenant.id).carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
        netAmount: '1000',
        paymentDate: new Date('2026-01-10'),
      },
    });

    await expect(
      forTenant(seed.tenant.id).carrierPayment.update({
        where: { id: payment.id },
        data: { grossAmount: '1' },
      }),
    ).rejects.toThrow();
  });

  it('CarrierPayment é append-only: impede DELETE — correção é estorno, linha nova', async () => {
    const payment = await forTenant(seed.tenant.id).carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
        netAmount: '1000',
        paymentDate: new Date('2026-01-10'),
      },
    });

    await expect(
      forTenant(seed.tenant.id).carrierPayment.delete({ where: { id: payment.id } }),
    ).rejects.toThrow();
  });

  it('recusa DEDUCTION sem motivo (CHECK no banco)', async () => {
    await expect(
      forTenant(seed.tenant.id).carrierPayment.create({
        data: {
          id: uuidv7(),
          tenantId: seed.tenant.id,
          carrierHireId: hire.id,
          type: 'DEDUCTION',
          grossAmount: '200',
          netAmount: '200',
          paymentDate: new Date('2026-01-10'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa motivo de desconto em evento que não é DEDUCTION', async () => {
    await expect(
      forTenant(seed.tenant.id).carrierPayment.create({
        data: {
          id: uuidv7(),
          tenantId: seed.tenant.id,
          carrierHireId: hire.id,
          type: 'ADVANCE',
          grossAmount: '200',
          netAmount: '200',
          deductionReasonId: damageReasonId,
          paymentDate: new Date('2026-01-10'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa criar pagamento sem netAmount — NOT NULL no banco', async () => {
    // Prisma Client já recusaria isso em tempo de compilação (netAmount é
    // obrigatório no schema) — INSERT cru prova que a garantia é do
    // banco, não só do tipo TypeScript.
    await expect(
      forTenant(seed.tenant.id)
        .$executeRaw`INSERT INTO "CarrierPayment" (id, "tenantId", "carrierHireId", "type", "grossAmount", "paymentDate")
          VALUES (${uuidv7()}, ${seed.tenant.id}, ${hire.id}, 'ADVANCE', 1000, ${new Date('2026-01-10')})`,
    ).rejects.toThrow();
  });

  it('saldo fecha certo com dois adiantamentos parciais e um desconto', async () => {
    const tenantPrisma = forTenant(seed.tenant.id);
    await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
        netAmount: '1000',
        paymentDate: new Date('2026-01-05'),
      },
    });
    await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '500',
        netAmount: '500',
        paymentDate: new Date('2026-01-15'),
      },
    });
    await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'DEDUCTION',
        grossAmount: '200',
        netAmount: '200',
        deductionReasonId: damageReasonId,
        paymentDate: new Date('2026-01-20'),
      },
    });

    const payments = await tenantPrisma.carrierPayment.findMany({
      where: { carrierHireId: hire.id },
    });
    const balance = computeBalance(hire.agreedFreight, payments);

    expect(balance.toString()).toBe('1300');
  });

  it('recusa REVERSAL sem reversesPaymentId (CHECK no banco)', async () => {
    await expect(
      forTenant(seed.tenant.id).carrierPayment.create({
        data: {
          id: uuidv7(),
          tenantId: seed.tenant.id,
          carrierHireId: hire.id,
          type: 'REVERSAL',
          grossAmount: '1000',
          netAmount: '1000',
          paymentDate: new Date('2026-01-06'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa reversesPaymentId em evento que não é REVERSAL', async () => {
    const tenantPrisma = forTenant(seed.tenant.id);
    const advance = await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
        netAmount: '1000',
        paymentDate: new Date('2026-01-05'),
      },
    });

    await expect(
      tenantPrisma.carrierPayment.create({
        data: {
          id: uuidv7(),
          tenantId: seed.tenant.id,
          carrierHireId: hire.id,
          type: 'ADVANCE',
          grossAmount: '500',
          netAmount: '500',
          reversesPaymentId: advance.id,
          paymentDate: new Date('2026-01-06'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa estornar o mesmo pagamento duas vezes (índice único parcial)', async () => {
    const tenantPrisma = forTenant(seed.tenant.id);
    const advance = await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
        netAmount: '1000',
        paymentDate: new Date('2026-01-05'),
      },
    });
    await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'REVERSAL',
        grossAmount: '1000',
        netAmount: '1000',
        reversesPaymentId: advance.id,
        paymentDate: new Date('2026-01-06'),
      },
    });

    await expect(
      tenantPrisma.carrierPayment.create({
        data: {
          id: uuidv7(),
          tenantId: seed.tenant.id,
          carrierHireId: hire.id,
          type: 'REVERSAL',
          grossAmount: '1000',
          netAmount: '1000',
          reversesPaymentId: advance.id,
          paymentDate: new Date('2026-01-07'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa netAmount maior que grossAmount — retenção nunca é maior que o bruto', async () => {
    await expect(
      forTenant(seed.tenant.id).carrierPayment.create({
        data: {
          id: uuidv7(),
          tenantId: seed.tenant.id,
          carrierHireId: hire.id,
          type: 'ADVANCE',
          grossAmount: '1000',
          netAmount: '1000.01',
          paymentDate: new Date('2026-01-05'),
        },
      }),
    ).rejects.toThrow();
  });

  it('sem retenção, netAmount = grossAmount — SUM(netAmount) bate com o valor cheio', async () => {
    const tenantPrisma = forTenant(seed.tenant.id);
    await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
        netAmount: '1000',
        paymentDate: new Date('2026-01-05'),
      },
    });

    const payments = await tenantPrisma.carrierPayment.findMany({
      where: { carrierHireId: hire.id },
    });
    const netTotal = payments.reduce(
      (sum, p) => sum.plus(p.netAmount),
      new Prisma.Decimal(0),
    );

    expect(netTotal.toString()).toBe('1000');
  });

  it('com retenção, SUM(netAmount) reflete o valor líquido, não o bruto', async () => {
    const tenantPrisma = forTenant(seed.tenant.id);
    // Pagamento a TAC pessoa física com retenção: bruto 1000, líquido 900.
    await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
        netAmount: '900',
        paymentDate: new Date('2026-01-05'),
      },
    });

    const payments = await tenantPrisma.carrierPayment.findMany({
      where: { carrierHireId: hire.id },
    });
    const grossTotal = payments.reduce(
      (sum, p) => sum.plus(p.grossAmount),
      new Prisma.Decimal(0),
    );
    const netTotal = payments.reduce(
      (sum, p) => sum.plus(p.netAmount),
      new Prisma.Decimal(0),
    );

    expect(grossTotal.toString()).toBe('1000');
    expect(netTotal.toString()).toBe('900');
  });

  it('estorno válido devolve o saldo ao valor anterior', async () => {
    const tenantPrisma = forTenant(seed.tenant.id);
    const advance = await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
        netAmount: '1000',
        paymentDate: new Date('2026-01-05'),
      },
    });

    const balanceAfterAdvance = computeBalance(hire.agreedFreight, [advance]);
    expect(balanceAfterAdvance.toString()).toBe('2000');

    await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'REVERSAL',
        grossAmount: '1000',
        netAmount: '1000',
        reversesPaymentId: advance.id,
        paymentDate: new Date('2026-01-06'),
      },
    });

    const payments = await tenantPrisma.carrierPayment.findMany({
      where: { carrierHireId: hire.id },
    });
    const balance = computeBalance(hire.agreedFreight, payments);

    expect(balance.toString()).toBe('3000');
  });

  it('vale-pedágio não altera o saldo do terceiro — não é frete nem desconto', async () => {
    const tenantPrisma = forTenant(seed.tenant.id);
    await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
        netAmount: '1000',
        paymentDate: new Date('2026-01-05'),
      },
    });
    await tenantPrisma.tollVoucherPurchase.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        tollVoucherSupplierCnpj: '11444777000161',
        tollVoucherPurchaseNumber: 'VP-001',
        tollVoucherAmount: '450.30',
      },
    });

    const payments = await tenantPrisma.carrierPayment.findMany({
      where: { carrierHireId: hire.id },
    });
    const balance = computeBalance(hire.agreedFreight, payments);

    expect(balance.toString()).toBe('2000');
  });
});
