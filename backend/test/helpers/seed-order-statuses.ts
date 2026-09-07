import type { PrismaClient } from '@prisma/client';

// Mesmo problema do QuoteStatus/TripStatus (seed-quote-statuses.ts,
// seed-trip-statuses.ts): TRUNCATE ... "Tenant" CASCADE varre OrderStatus
// também (FK pra Tenant), inclusive as linhas com tenantId NULL semeadas
// na migração (20260908050000_add_order_status_and_customer_reference).
// Qualquer teste que trunque Tenant e crie Order precisa re-semear antes.
export async function ensureOrderStatusesSeeded(admin: PrismaClient) {
  const defaults: [string, string, string][] = [
    ['00000000-0000-7000-8000-000000000021', 'IN_PROGRESS', 'Em andamento'],
    ['00000000-0000-7000-8000-000000000022', 'COMPLETED', 'Finalizado'],
    ['00000000-0000-7000-8000-000000000023', 'CANCELLED', 'Cancelado'],
  ];

  for (const [id, code, name] of defaults) {
    await admin.$executeRaw`
      INSERT INTO "OrderStatus" (id, "tenantId", code, name, "createdAt", "updatedAt")
      VALUES (${id}::uuid, NULL, ${code}, ${name}, now(), now())
      ON CONFLICT (code) WHERE "tenantId" IS NULL DO NOTHING
    `;
  }
}
