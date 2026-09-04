import type { PrismaClient } from '@prisma/client';

// Mesmo problema do QuoteStatus (test/helpers/seed-quote-statuses.ts):
// TRUNCATE ... "Tenant" CASCADE varre TripStatus também, mesmo as linhas
// com tenantId NULL semeadas na migração (20260904081754_add_trip). Só
// precisa rodar nos arquivos de teste que criam Trip — cada um já reseeda
// no próprio beforeEach antes de precisar do dado.
export async function ensureTripStatusesSeeded(admin: PrismaClient) {
  const defaults: [string, string, string, boolean][] = [
    ['00000000-0000-7000-8000-000000000011', 'PENDING_RISK_CLEARANCE', 'Aguardando liberação de risco', false],
    ['00000000-0000-7000-8000-000000000012', 'IN_TRANSIT', 'Em trânsito', true],
  ];

  for (const [id, code, name, isPublic] of defaults) {
    await admin.$executeRaw`
      INSERT INTO "TripStatus" (id, "tenantId", code, name, "isPublic", "createdAt", "updatedAt")
      VALUES (${id}::uuid, NULL, ${code}, ${name}, ${isPublic}, now(), now())
      ON CONFLICT (code) WHERE "tenantId" IS NULL DO NOTHING
    `;
  }
}
