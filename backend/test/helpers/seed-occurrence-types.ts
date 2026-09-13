import type { PrismaClient } from '@prisma/client';

// Mesmo problema do QuoteStatus/TripStatus/DeductionReason (test/helpers/
// seed-quote-statuses.ts): TRUNCATE ... "Tenant" CASCADE varre
// OccurrenceType também, mesmo as linhas com tenantId NULL semeadas na
// migração (20260907000258_add_occurrence).
export async function ensureOccurrenceTypesSeeded(admin: PrismaClient) {
  const defaults: [string, string, string, boolean][] = [
    ['00000000-0000-7000-8000-000000000201', 'DELAY', 'Atraso', true],
    ['00000000-0000-7000-8000-000000000202', 'COMMERCIAL_HOLD', 'Retenção comercial', false],
    // Unidade "datas na viagem": encerramento do ciclo da mesma viagem
    // (sócio), não viagem nova nem terceira data — ver migração
    // 20260912020000_trip_origin_and_time_windows. isPublic=false
    // (confirmado com o sócio): operação interna entre transportadora e
    // armador, é onde o demurrage aparece, embarcador não acompanha.
    ['00000000-0000-7000-8000-000000000203', 'EMPTY_RETURN', 'Devolução de vazio', false],
  ];

  for (const [id, code, name, isPublic] of defaults) {
    await admin.$executeRaw`
      INSERT INTO "OccurrenceType" (id, "tenantId", code, name, "isPublic", "createdAt", "updatedAt")
      VALUES (${id}::uuid, NULL, ${code}, ${name}, ${isPublic}, now(), now())
      ON CONFLICT (code) WHERE "tenantId" IS NULL DO NOTHING
    `;
  }
}
