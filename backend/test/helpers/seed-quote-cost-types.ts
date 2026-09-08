import type { PrismaClient } from '@prisma/client';

// Mesmo problema do QuoteStatus/TripStatus/OrderStatus: TRUNCATE ...
// "Tenant" CASCADE varre QuoteCostType também (FK pra Tenant), inclusive
// as linhas com tenantId NULL semeadas na migração
// (20260908060000_add_quote_pricing). Qualquer teste que trunque Tenant
// e crie QuoteCostLine precisa re-semear antes.
export async function ensureQuoteCostTypesSeeded(admin: PrismaClient) {
  const defaults: [string, string, string][] = [
    ['00000000-0000-7000-8000-000000000031', 'FREIGHT', 'Frete terceiro'],
    ['00000000-0000-7000-8000-000000000032', 'TOLL', 'Pedágio'],
    ['00000000-0000-7000-8000-000000000033', 'FUEL', 'Combustível'],
    ['00000000-0000-7000-8000-000000000034', 'INSURANCE', 'Seguro'],
    ['00000000-0000-7000-8000-000000000035', 'FEES', 'Taxas'],
  ];

  for (const [id, code, name] of defaults) {
    await admin.$executeRaw`
      INSERT INTO "QuoteCostType" (id, "tenantId", code, name, "createdAt", "updatedAt")
      VALUES (${id}::uuid, NULL, ${code}, ${name}, now(), now())
      ON CONFLICT (code) WHERE "tenantId" IS NULL DO NOTHING
    `;
  }
}
