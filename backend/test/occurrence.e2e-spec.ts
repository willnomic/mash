import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { ensureOccurrenceTypesSeeded } from './helpers/seed-occurrence-types.js';
import { seedOccurrenceScenario } from './helpers/seed-occurrence-scenario.js';

// Roda contra o PostgreSQL real do docker-compose — RLS, CHECK e GRANT de
// coluna são do banco, não dá pra mockar (D-018/D-020, evento da viagem
// que alimenta o portal do embarcador da D-010).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Occurrence", "OccurrenceType", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;

describe('Occurrence · evento da viagem (D-018)', () => {
  let seedA: Awaited<ReturnType<typeof seedOccurrenceScenario>>;
  let seedB: Awaited<ReturnType<typeof seedOccurrenceScenario>>;
  let delayTypeId: string;
  let commercialHoldTypeId: string;

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    await ensureOccurrenceTypesSeeded(admin);
    seedA = await seedOccurrenceScenario(admin, 'A', 'transportadora-a');
    seedB = await seedOccurrenceScenario(admin, 'B', 'transportadora-b');
    delayTypeId = (
      await admin.occurrenceType.findFirstOrThrow({ where: { code: 'DELAY' } })
    ).id;
    commercialHoldTypeId = (
      await admin.occurrenceType.findFirstOrThrow({ where: { code: 'COMMERCIAL_HOLD' } })
    ).id;
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    await ensureOccurrenceTypesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  describe('Row-Level Security (D-012)', () => {
    beforeEach(async () => {
      await admin.occurrence.create({
        data: {
          id: uuidv7(),
          tenantId: seedA.tenant.id,
          branchId: seedA.branch.id,
          tripId: seedA.trip.id,
          typeId: delayTypeId,
          description: 'Ocorrência do tenant A',
          occurredAt: new Date('2026-01-10T08:00:00Z'),
        },
      });
      await admin.occurrence.create({
        data: {
          id: uuidv7(),
          tenantId: seedB.tenant.id,
          branchId: seedB.branch.id,
          tripId: seedB.trip.id,
          typeId: delayTypeId,
          description: 'Ocorrência do tenant B',
          occurredAt: new Date('2026-01-10T08:00:00Z'),
        },
      });
    });

    it('não enxerga dado de outro tenant', async () => {
      const occurrences = await forTenant(seedA.tenant.id).occurrence.findMany();

      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].tenantId).toBe(seedA.tenant.id);
    });

    it('sem tenant definido, não retorna nada', async () => {
      const occurrences = await base.occurrence.findMany();

      expect(occurrences).toHaveLength(0);
    });

    it('protege também consulta crua', async () => {
      const rows = await forTenant(
        seedA.tenant.id,
      ).$queryRaw`SELECT * FROM "Occurrence"`;

      expect(rows).toHaveLength(1);
    });

    it('impede gravar no tenant alheio', async () => {
      await expect(
        forTenant(seedA.tenant.id).occurrence.create({
          data: {
            id: uuidv7(),
            tenantId: seedB.tenant.id,
            branchId: seedB.branch.id,
            tripId: seedB.trip.id,
            typeId: delayTypeId,
            description: 'Tentativa cruzada',
            occurredAt: new Date('2026-01-10T08:00:00Z'),
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('imutabilidade e append (D-014/D-017)', () => {
    it('recusa occurredAt posterior a createdAt (CHECK no banco)', async () => {
      await expect(
        forTenant(seedA.tenant.id).occurrence.create({
          data: {
            id: uuidv7(),
            tenantId: seedA.tenant.id,
            branchId: seedA.branch.id,
            tripId: seedA.trip.id,
            typeId: delayTypeId,
            description: 'Data impossível',
            occurredAt: new Date('2999-01-01T00:00:00Z'),
          },
        }),
      ).rejects.toThrow();
    });

    it('libera corrigir a descrição depois de registrada', async () => {
      const occurrence = await forTenant(seedA.tenant.id).occurrence.create({
        data: {
          id: uuidv7(),
          tenantId: seedA.tenant.id,
          branchId: seedA.branch.id,
          tripId: seedA.trip.id,
          typeId: delayTypeId,
          description: 'Descrição original',
          occurredAt: new Date('2026-01-10T08:00:00Z'),
        },
      });

      const updated = await forTenant(seedA.tenant.id).occurrence.update({
        where: { id: occurrence.id },
        data: { description: 'Descrição corrigida' },
      });

      expect(updated.description).toBe('Descrição corrigida');
    });

    it('impede trocar o tipo depois de registrada — coluna não concedida', async () => {
      const occurrence = await forTenant(seedA.tenant.id).occurrence.create({
        data: {
          id: uuidv7(),
          tenantId: seedA.tenant.id,
          branchId: seedA.branch.id,
          tripId: seedA.trip.id,
          typeId: delayTypeId,
          description: 'Ocorrência original',
          occurredAt: new Date('2026-01-10T08:00:00Z'),
        },
      });

      await expect(
        forTenant(seedA.tenant.id).occurrence.update({
          where: { id: occurrence.id },
          data: { typeId: commercialHoldTypeId },
        }),
      ).rejects.toThrow();
    });

    it('impede trocar occurredAt depois de registrada — coluna não concedida', async () => {
      const occurrence = await forTenant(seedA.tenant.id).occurrence.create({
        data: {
          id: uuidv7(),
          tenantId: seedA.tenant.id,
          branchId: seedA.branch.id,
          tripId: seedA.trip.id,
          typeId: delayTypeId,
          description: 'Ocorrência original',
          occurredAt: new Date('2026-01-10T08:00:00Z'),
        },
      });

      await expect(
        forTenant(seedA.tenant.id).occurrence.update({
          where: { id: occurrence.id },
          data: { occurredAt: new Date('2026-01-11T08:00:00Z') },
        }),
      ).rejects.toThrow();
    });

    it('impede apagar — vai para o cliente pela D-010, apagada é pior que não registrada', async () => {
      const occurrence = await forTenant(seedA.tenant.id).occurrence.create({
        data: {
          id: uuidv7(),
          tenantId: seedA.tenant.id,
          branchId: seedA.branch.id,
          tripId: seedA.trip.id,
          typeId: delayTypeId,
          description: 'Ocorrência original',
          occurredAt: new Date('2026-01-10T08:00:00Z'),
        },
      });

      await expect(
        forTenant(seedA.tenant.id).occurrence.delete({ where: { id: occurrence.id } }),
      ).rejects.toThrow();
    });
  });

  describe('visibilidade pública/interna (D-010)', () => {
    it('consulta filtrada por isPublic esconde a ocorrência de retenção comercial', async () => {
      const delayType = await admin.occurrenceType.findFirstOrThrow({
        where: { code: 'DELAY' },
      });
      const commercialHoldType = await admin.occurrenceType.findFirstOrThrow({
        where: { code: 'COMMERCIAL_HOLD' },
      });
      expect(delayType.isPublic).toBe(true);
      expect(commercialHoldType.isPublic).toBe(false);

      const publicOccurrence = await forTenant(seedA.tenant.id).occurrence.create({
        data: {
          id: uuidv7(),
          tenantId: seedA.tenant.id,
          branchId: seedA.branch.id,
          tripId: seedA.trip.id,
          typeId: delayTypeId,
          description: 'Atraso por trânsito',
          occurredAt: new Date('2026-01-10T08:00:00Z'),
        },
      });
      const internalOccurrence = await forTenant(seedA.tenant.id).occurrence.create({
        data: {
          id: uuidv7(),
          tenantId: seedA.tenant.id,
          branchId: seedA.branch.id,
          tripId: seedA.trip.id,
          typeId: commercialHoldTypeId,
          description: 'Carga retida por pendência financeira do cliente',
          occurredAt: new Date('2026-01-10T09:00:00Z'),
        },
      });

      // Simula exatamente o filtro que uma rota pública (futuro portal do
      // embarcador, D-010) aplicaria — nunca expor tipo interno.
      const publiclyVisible = await forTenant(seedA.tenant.id).occurrence.findMany({
        where: { type: { isPublic: true } },
      });
      const visibleIds = publiclyVisible.map((o) => o.id);

      expect(visibleIds).toContain(publicOccurrence.id);
      expect(visibleIds).not.toContain(internalOccurrence.id);
    });
  });
});
