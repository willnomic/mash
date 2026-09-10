import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base } from '../src/prisma/prisma-tenant.js';
import { ensureDayPeriodsSeeded } from './helpers/seed-day-periods.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedPickupOrderScenario } from './helpers/seed-pickup-order-scenario.js';

// As cinco invariantes de TimeWindow (shared/src/time-window/
// time-window.types.ts, validateTimeWindow) impostas por CHECK no banco
// (migração 20260910000000_add_day_period_and_pickup_time_window). Prova
// especificamente o caso NULL de cada uma — é onde a lógica de três
// valores do SQL esconde bug: "coluna = valor" com coluna NULL avalia pra
// NULL, não FALSE, e o Postgres trata CHECK que avalia NULL como
// satisfeito, não violado (bug real já visto num CHECK parecido do
// TaxRate, D-043, só pego por teste).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "PickupOrderItem", "PickupOrder", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;

describe('PickupOrder · CHECK da janela de tempo estruturada (D-045)', () => {
  let scenario: Awaited<ReturnType<typeof seedPickupOrderScenario>>;
  let morningId: string;

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    await ensureDayPeriodsSeeded(admin);
    scenario = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1);
    morningId = (
      await admin.dayPeriod.findFirstOrThrow({ where: { code: 'MORNING', tenantId: null } })
    ).id;
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    await ensureDayPeriodsSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  // Cria um PickupOrder adicional reaproveitando a mesma cadeia (tenant/
  // branch/trip/address) da seed — só o que varia entre os testes é a
  // janela de tempo em si.
  function createWith(overrides: {
    pickupStartTime?: string | null;
    pickupEndTime?: string | null;
    pickupEndsNextDay?: boolean;
    pickupDayPeriodId?: string | null;
  }) {
    return admin.pickupOrder.create({
      data: {
        id: uuidv7(),
        tenantId: scenario.tenant.id,
        branchId: scenario.branch.id,
        tripId: scenario.trip.id,
        addressId: scenario.address.id,
        pickupDate: new Date('2026-09-10'),
        totalWeightKg: '100.000',
        totalVolumeCount: 1,
        totalCubicMeters: '1.000',
        ...overrides,
      },
    });
  }

  describe('(a) formato — start/end são "HH:mm" válido quando preenchidos', () => {
    it('NULL nos dois é aceito (nada estruturado ainda não é erro de formato)', async () => {
      await expect(
        createWith({ pickupStartTime: null, pickupEndTime: null }),
      ).resolves.toBeTruthy();
    });

    it('recusa hora sem zero à esquerda ("9:00")', async () => {
      await expect(createWith({ pickupStartTime: '9:00' })).rejects.toThrow();
    });

    it('recusa hora fora do intervalo (25:00)', async () => {
      await expect(createWith({ pickupStartTime: '25:00' })).rejects.toThrow();
    });

    it('recusa minuto fora do intervalo (08:60)', async () => {
      await expect(createWith({ pickupEndTime: '08:60' })).rejects.toThrow();
    });
  });

  describe('(b) dayPeriodId exclui horário — start/end nulos e endsNextDay falso', () => {
    it('dayPeriodId sozinho (start/end NULL) é aceito', async () => {
      await expect(createWith({ pickupDayPeriodId: morningId })).resolves.toBeTruthy();
    });

    it('recusa dayPeriodId junto de pickupStartTime preenchido', async () => {
      await expect(
        createWith({ pickupDayPeriodId: morningId, pickupStartTime: '08:00' }),
      ).rejects.toThrow();
    });

    it('recusa dayPeriodId junto de pickupEndTime preenchido', async () => {
      await expect(
        createWith({ pickupDayPeriodId: morningId, pickupEndTime: '10:00' }),
      ).rejects.toThrow();
    });

    it('recusa dayPeriodId junto de endsNextDay verdadeiro', async () => {
      await expect(
        createWith({
          pickupDayPeriodId: morningId,
          pickupStartTime: '22:00',
          pickupEndTime: '02:00',
          pickupEndsNextDay: true,
        }),
      ).rejects.toThrow();
    });
  });

  describe('(c) endsNextDay verdadeiro exige start E end preenchidos', () => {
    it('recusa endsNextDay verdadeiro com start NULL', async () => {
      await expect(
        createWith({ pickupStartTime: null, pickupEndTime: '02:00', pickupEndsNextDay: true }),
      ).rejects.toThrow();
    });

    it('recusa endsNextDay verdadeiro com end NULL', async () => {
      await expect(
        createWith({ pickupStartTime: '22:00', pickupEndTime: null, pickupEndsNextDay: true }),
      ).rejects.toThrow();
    });

    it('recusa endsNextDay verdadeiro com os dois NULL', async () => {
      await expect(
        createWith({ pickupStartTime: null, pickupEndTime: null, pickupEndsNextDay: true }),
      ).rejects.toThrow();
    });
  });

  describe('(d) endsNextDay verdadeiro exige end < start', () => {
    it('aceita end < start (cruza meia-noite de verdade)', async () => {
      await expect(
        createWith({ pickupStartTime: '22:00', pickupEndTime: '02:00', pickupEndsNextDay: true }),
      ).resolves.toBeTruthy();
    });

    it('recusa end >= start com endsNextDay verdadeiro (não cruza meia-noite de verdade)', async () => {
      await expect(
        createWith({ pickupStartTime: '08:00', pickupEndTime: '10:00', pickupEndsNextDay: true }),
      ).rejects.toThrow();
    });

    it('recusa end == start com endsNextDay verdadeiro', async () => {
      await expect(
        createWith({ pickupStartTime: '08:00', pickupEndTime: '08:00', pickupEndsNextDay: true }),
      ).rejects.toThrow();
    });
  });

  describe('(e) endsNextDay falso, com os dois preenchidos, exige end >= start', () => {
    it('aceita end >= start', async () => {
      await expect(
        createWith({ pickupStartTime: '08:00', pickupEndTime: '10:00' }),
      ).resolves.toBeTruthy();
    });

    it('aceita end == start (precisão EXACT)', async () => {
      await expect(
        createWith({ pickupStartTime: '08:00', pickupEndTime: '08:00' }),
      ).resolves.toBeTruthy();
    });

    it('recusa end < start sem endsNextDay', async () => {
      await expect(
        createWith({ pickupStartTime: '10:00', pickupEndTime: '08:00' }),
      ).rejects.toThrow();
    });

    it('aceita start NULL com end preenchido (precisão UNTIL — regra não se aplica)', async () => {
      await expect(
        createWith({ pickupStartTime: null, pickupEndTime: '08:00' }),
      ).resolves.toBeTruthy();
    });

    it('aceita start preenchido com end NULL (precisão FROM — regra não se aplica)', async () => {
      await expect(
        createWith({ pickupStartTime: '08:00', pickupEndTime: null }),
      ).resolves.toBeTruthy();
    });
  });
});
