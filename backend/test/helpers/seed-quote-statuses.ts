import type { PrismaClient } from '@prisma/client';

// TRUNCATE ... "Tenant" CASCADE varre QuoteStatus também (tem FK pra
// Tenant) — inclusive as linhas com tenantId NULL semeadas na migração
// (20260904075346_add_quote_order). TRUNCATE não filtra por linha, então
// qualquer teste que trunque Tenant precisa re-semear os três status
// padrão depois.
//
// SQL cru, não upsert do Prisma: o @@unique([tenantId, code]) composto
// não aceita null como valor de busca (Prisma recusa mesmo a coluna
// sendo nula no banco — "Argument tenantId must not be null"). ON
// CONFLICT mira direto no índice parcial que cobre exatamente esse caso
// (QuoteStatus_code_system_default_key, migração 20260904075346).
export async function ensureQuoteStatusesSeeded(admin: PrismaClient) {
  const defaults: [string, string, string][] = [
    ['00000000-0000-7000-8000-000000000001', 'OPEN', 'Aberta'],
    ['00000000-0000-7000-8000-000000000002', 'CLOSED', 'Fechada'],
    // Reaproveitado como recusa explícita do cliente (QuoteService.reject(),
    // unidade "ciclo de vida da Quote"). Renomeado de LOST/"Perdida" pra
    // REJECTED/"Recusada" em 20260910020000_rename_quote_status_lost_to_rejected
    // — mesmo id, code/name novos.
    ['00000000-0000-7000-8000-000000000003', 'REJECTED', 'Recusada'],
    ['00000000-0000-7000-8000-000000000091', 'ACCEPTED', 'Aceita'],
  ];

  for (const [id, code, name] of defaults) {
    await admin.$executeRaw`
      INSERT INTO "QuoteStatus" (id, "tenantId", code, name, "createdAt", "updatedAt")
      VALUES (${id}::uuid, NULL, ${code}, ${name}, now(), now())
      ON CONFLICT (code) WHERE "tenantId" IS NULL DO NOTHING
    `;
  }
}
