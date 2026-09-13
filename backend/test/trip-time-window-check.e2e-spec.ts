import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureDayPeriodsSeeded } from './helpers/seed-day-periods.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedOrderScenario } from './helpers/seed-order-scenario.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: CHECK é do
// banco). Mesmas cinco invariantes de TimeWindow da D-045
// (PickupOrder), agora impostas pela SEGUNDA vez — em Trip, nas duas
// pontas (origem/destino), unidade "datas na viagem". Os dez CHECK
// (migração 20260912020000_trip_origin_and_time_windows) são a mesma
// redação da D-045 com o prefixo trocado — os testes abaixo são
// parametrizados por ponta em vez de duplicados por cópia, porque a
// regra é literalmente idêntica dos dois lados.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;

describe('Trip · CHECK das janelas de tempo estruturadas nas duas pontas (unidade "datas na viagem")', () => {
  let scenario: Awaited<ReturnType<typeof seedOrderScenario>>;
  let statusId: string;
  let morningId: string;

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    await ensureDayPeriodsSeeded(admin);
    scenario = await seedOrderScenario(admin, 'A', 'transportadora-a');
    statusId = (
      await admin.tripStatus.findFirstOrThrow({
        where: { code: 'PENDING_RISK_CLEARANCE' },
      })
    ).id;
    morningId = (
      await admin.dayPeriod.findFirstOrThrow({
        where: { code: 'MORNING', tenantId: null },
      })
    ).id;
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    await ensureDayPeriodsSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  type WindowOverrides = {
    startTime?: string | null;
    endTime?: string | null;
    endsNextDay?: boolean;
    dayPeriodId?: string | null;
  };

  // Único ponto que precisa de chave dinâmica (origin*/destination*) — a
  // regra e os testes são idênticos dos dois lados, só o prefixo muda.
  function createWith(side: 'origin' | 'destination', overrides: WindowOverrides) {
    const data: Record<string, unknown> = {
      id: uuidv7(),
      tenantId: scenario.tenant.id,
      branchId: scenario.branch.id,
      orderId: scenario.order.id,
      sequence: 1,
      statusId,
    };
    if ('startTime' in overrides) data[`${side}StartTime`] = overrides.startTime;
    if ('endTime' in overrides) data[`${side}EndTime`] = overrides.endTime;
    if ('endsNextDay' in overrides) data[`${side}EndsNextDay`] = overrides.endsNextDay;
    if ('dayPeriodId' in overrides) data[`${side}DayPeriodId`] = overrides.dayPeriodId;

    return forTenant(scenario.tenant.id).trip.create({
      data: data as Prisma.TripUncheckedCreateInput,
    });
  }

  describe.each(['origin', 'destination'] as const)('ponta: %s', (side) => {
    describe('(a) formato — start/end são "HH:mm" válido quando preenchidos', () => {
      it('NULL nos dois é aceito (nada estruturado ainda não é erro de formato)', async () => {
        await expect(
          createWith(side, { startTime: null, endTime: null }),
        ).resolves.toBeTruthy();
      });

      it('recusa hora sem zero à esquerda ("9:00")', async () => {
        await expect(createWith(side, { startTime: '9:00' })).rejects.toThrow();
      });

      it('recusa hora fora do intervalo (25:00)', async () => {
        await expect(createWith(side, { startTime: '25:00' })).rejects.toThrow();
      });

      it('recusa minuto fora do intervalo (08:60)', async () => {
        await expect(createWith(side, { endTime: '08:60' })).rejects.toThrow();
      });
    });

    describe('(b) dayPeriodId exclui horário — start/end nulos e endsNextDay falso', () => {
      it('dayPeriodId sozinho (start/end NULL) é aceito', async () => {
        await expect(
          createWith(side, { dayPeriodId: morningId }),
        ).resolves.toBeTruthy();
      });

      it('recusa dayPeriodId junto de startTime preenchido', async () => {
        await expect(
          createWith(side, { dayPeriodId: morningId, startTime: '08:00' }),
        ).rejects.toThrow();
      });

      it('recusa dayPeriodId junto de endTime preenchido', async () => {
        await expect(
          createWith(side, { dayPeriodId: morningId, endTime: '10:00' }),
        ).rejects.toThrow();
      });

      it('recusa dayPeriodId junto de endsNextDay verdadeiro', async () => {
        await expect(
          createWith(side, {
            dayPeriodId: morningId,
            startTime: '22:00',
            endTime: '02:00',
            endsNextDay: true,
          }),
        ).rejects.toThrow();
      });
    });

    describe('(c) endsNextDay verdadeiro exige start E end preenchidos', () => {
      it('recusa endsNextDay verdadeiro com start NULL', async () => {
        await expect(
          createWith(side, { startTime: null, endTime: '02:00', endsNextDay: true }),
        ).rejects.toThrow();
      });

      it('recusa endsNextDay verdadeiro com end NULL', async () => {
        await expect(
          createWith(side, { startTime: '22:00', endTime: null, endsNextDay: true }),
        ).rejects.toThrow();
      });

      it('recusa endsNextDay verdadeiro com os dois NULL', async () => {
        await expect(
          createWith(side, { startTime: null, endTime: null, endsNextDay: true }),
        ).rejects.toThrow();
      });
    });

    describe('(d) endsNextDay verdadeiro exige end < start', () => {
      it('aceita end < start (cruza meia-noite de verdade)', async () => {
        await expect(
          createWith(side, { startTime: '22:00', endTime: '02:00', endsNextDay: true }),
        ).resolves.toBeTruthy();
      });

      it('recusa end >= start com endsNextDay verdadeiro (não cruza meia-noite de verdade)', async () => {
        await expect(
          createWith(side, { startTime: '08:00', endTime: '10:00', endsNextDay: true }),
        ).rejects.toThrow();
      });

      it('recusa end == start com endsNextDay verdadeiro', async () => {
        await expect(
          createWith(side, { startTime: '08:00', endTime: '08:00', endsNextDay: true }),
        ).rejects.toThrow();
      });
    });

    describe('(e) endsNextDay falso, com os dois preenchidos, exige end >= start', () => {
      it('aceita end >= start', async () => {
        await expect(
          createWith(side, { startTime: '08:00', endTime: '10:00' }),
        ).resolves.toBeTruthy();
      });

      it('aceita end == start (precisão EXACT)', async () => {
        await expect(
          createWith(side, { startTime: '08:00', endTime: '08:00' }),
        ).resolves.toBeTruthy();
      });

      it('recusa end < start sem endsNextDay', async () => {
        await expect(
          createWith(side, { startTime: '10:00', endTime: '08:00' }),
        ).rejects.toThrow();
      });

      it('aceita start NULL com end preenchido (precisão UNTIL — regra não se aplica)', async () => {
        await expect(
          createWith(side, { startTime: null, endTime: '08:00' }),
        ).resolves.toBeTruthy();
      });

      it('aceita start preenchido com end NULL (precisão FROM — regra não se aplica)', async () => {
        await expect(
          createWith(side, { startTime: '08:00', endTime: null }),
        ).resolves.toBeTruthy();
      });
    });
  });

  // Prova de negócio (sócio): crossdocking sempre tem agendamento numa
  // janela própria em cada ponta, e o ponto do meio de um transbordo
  // (D-037) não precisa de NADA especial — ele é só destino da perna N e
  // origem da perna N+1, cada Trip com sua própria janela.
  describe('transbordo (D-037): duas Trip encadeadas com janela nas quatro pontas', () => {
    it('ponto do meio tem janela de chegada (destino da perna 1) e de saída (origem da perna 2), valores diferentes', async () => {
      const crossdockAddress = await admin.address.create({
        data: {
          id: uuidv7(),
          tenantId: scenario.tenant.id,
          logradouro: 'Pátio de Transbordo',
          bairro: 'Distrito Industrial',
          municipio: 'Curitiba',
          uf: 'PR',
          cep: '81000000',
        },
      });

      const leg1 = await forTenant(scenario.tenant.id).trip.create({
        data: {
          id: uuidv7(),
          tenantId: scenario.tenant.id,
          branchId: scenario.branch.id,
          orderId: scenario.order.id,
          sequence: 1,
          statusId,
          originAddressId: scenario.address.id,
          destinationAddressId: crossdockAddress.id,
          // Janela de chegada no ponto de transbordo — quem entrega.
          destinationStartTime: '08:00',
          destinationEndTime: '10:00',
        },
      });

      const leg2 = await forTenant(scenario.tenant.id).trip.create({
        data: {
          id: uuidv7(),
          tenantId: scenario.tenant.id,
          branchId: scenario.branch.id,
          orderId: scenario.order.id,
          sequence: 2,
          statusId,
          originAddressId: crossdockAddress.id,
          destinationAddressId: scenario.address.id,
          // Janela de saída no MESMO ponto — outro caminhão, outro
          // horário, valores diferentes da janela de chegada acima.
          originStartTime: '14:00',
          originEndTime: '16:00',
        },
      });

      expect(leg1.destinationAddressId).toBe(crossdockAddress.id);
      expect(leg2.originAddressId).toBe(crossdockAddress.id);
      expect(leg1.destinationAddressId).toBe(leg2.originAddressId);

      expect(leg1.destinationStartTime).toBe('08:00');
      expect(leg1.destinationEndTime).toBe('10:00');
      expect(leg2.originStartTime).toBe('14:00');
      expect(leg2.originEndTime).toBe('16:00');
      // As janelas de chegada (leg1) e de saída (leg2) não se confundem —
      // são colunas diferentes (destination* vs. origin*), cada Trip com
      // a sua, sem nada específico de transbordo construído.
      expect(leg1.originStartTime).toBeNull();
      expect(leg2.destinationStartTime).toBeNull();
    });
  });
});
