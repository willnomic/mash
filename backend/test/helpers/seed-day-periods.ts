import type { PrismaClient } from '@prisma/client';

// Mesmo problema do QuoteStatus/TripStatus/OrderStatus/QuoteCostType:
// TRUNCATE ... "Tenant" CASCADE varre DayPeriod também (FK pra Tenant),
// inclusive as linhas com tenantId NULL semeadas na migração
// (20260910000000_add_day_period_and_pickup_time_window). Qualquer teste
// que trunque Tenant e use pickupDayPeriodId precisa re-semear antes.
export async function ensureDayPeriodsSeeded(admin: PrismaClient) {
  const defaults: [string, string, string][] = [
    ['00000000-0000-7000-8000-000000000071', 'MORNING', 'Pela manhã'],
    ['00000000-0000-7000-8000-000000000072', 'LATE_MORNING', 'Final da manhã'],
    ['00000000-0000-7000-8000-000000000073', 'MIDDAY', 'Meio-dia'],
    ['00000000-0000-7000-8000-000000000074', 'EARLY_AFTERNOON', 'Início da tarde'],
    ['00000000-0000-7000-8000-000000000075', 'AFTERNOON', 'Pela tarde'],
    ['00000000-0000-7000-8000-000000000076', 'END_OF_DAY', 'Final do dia'],
    ['00000000-0000-7000-8000-000000000077', 'EVENING', 'À noite'],
    ['00000000-0000-7000-8000-000000000078', 'FIRST_HOUR', 'Primeira hora'],
    ['00000000-0000-7000-8000-000000000079', 'ALL_DAY', 'O dia inteiro'],
  ];

  for (const [id, code, name] of defaults) {
    await admin.$executeRaw`
      INSERT INTO "DayPeriod" (id, "tenantId", code, name, "createdAt", "updatedAt")
      VALUES (${id}::uuid, NULL, ${code}, ${name}, now(), now())
      ON CONFLICT (code) WHERE "tenantId" IS NULL DO NOTHING
    `;
  }
}
