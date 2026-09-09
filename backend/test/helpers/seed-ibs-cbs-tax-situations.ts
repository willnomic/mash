import type { PrismaClient } from '@prisma/client';

// Mesmo problema do QuoteCostType/QuoteStatus/TripStatus/OrderStatus:
// TRUNCATE ... "Tenant" CASCADE varre IbsCbsTaxSituation também (FK pra
// Tenant), inclusive a linha com tenantId NULL semeada na migração
// (20260909000000_tax_correction_and_expansion, D-043). Qualquer teste
// que trunque Tenant precisa re-semear antes.
export async function ensureIbsCbsTaxSituationsSeeded(admin: PrismaClient) {
  await admin.$executeRaw`
    INSERT INTO "IbsCbsTaxSituation" (id, "tenantId", cst, "cClassTrib", name, "createdAt", "updatedAt")
    VALUES (
      '00000000-0000-7000-8000-000000000061'::uuid, NULL, '000', '000001',
      'Tributação integral — transporte rodoviário de carga', now(), now()
    )
    ON CONFLICT (cst, "cClassTrib") WHERE "tenantId" IS NULL DO NOTHING
  `;
}
