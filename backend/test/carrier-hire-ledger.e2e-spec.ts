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
    await admin.$executeRaw`TRUNCATE TABLE "CarrierPayment", "CarrierHire", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Customer", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
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
    await admin.$executeRaw`TRUNCATE TABLE "CarrierPayment", "CarrierHire", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Customer", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;
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
        data: { thirdPartyId: seed.customer.id },
      }),
    ).rejects.toThrow();
  });

  it('libera atualizar CIOT e vale-pedágio depois da contratação', async () => {
    const updated = await forTenant(seed.tenant.id).carrierHire.update({
      where: { id: hire.id },
      data: {
        ciotNumber: '12345678901234567890123456',
        tollVoucherSupplierCnpj: '11444777000161',
        tollVoucherPurchaseNumber: 'VP-001',
        tollVoucherAmount: '450.30',
      },
    });

    expect(updated.ciotNumber).toBe('12345678901234567890123456');
    expect(updated.tollVoucherAmount?.toString()).toBe('450.3');
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
          deductionReasonId: damageReasonId,
          paymentDate: new Date('2026-01-10'),
        },
      }),
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

  it('estorno devolve o valor ao saldo', async () => {
    const tenantPrisma = forTenant(seed.tenant.id);
    await tenantPrisma.carrierPayment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        carrierHireId: hire.id,
        type: 'ADVANCE',
        grossAmount: '1000',
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
        paymentDate: new Date('2026-01-05'),
      },
    });
    await tenantPrisma.carrierHire.update({
      where: { id: hire.id },
      data: {
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
