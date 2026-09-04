import type { PrismaClient } from '@prisma/client';

// Mesmo problema do QuoteStatus/TripStatus (test/helpers/seed-quote-statuses.ts):
// TRUNCATE ... "Tenant" CASCADE varre DeductionReason também, mesmo as linhas
// com tenantId NULL semeadas na migração (20260904173040_add_carrier_hire_and_payment).
export async function ensureDeductionReasonsSeeded(admin: PrismaClient) {
  const defaults: [string, string, string][] = [
    ['00000000-0000-7000-8000-000000000101', 'DAMAGE', 'Avaria'],
    ['00000000-0000-7000-8000-000000000102', 'DETENTION', 'Diária'],
    ['00000000-0000-7000-8000-000000000103', 'FINE', 'Multa'],
    ['00000000-0000-7000-8000-000000000104', 'FUEL', 'Abastecimento'],
  ];

  for (const [id, code, name] of defaults) {
    await admin.$executeRaw`
      INSERT INTO "DeductionReason" (id, "tenantId", code, name, "createdAt", "updatedAt")
      VALUES (${id}::uuid, NULL, ${code}, ${name}, now(), now())
      ON CONFLICT (code) WHERE "tenantId" IS NULL DO NOTHING
    `;
  }
}
