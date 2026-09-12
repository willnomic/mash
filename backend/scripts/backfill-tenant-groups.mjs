#!/usr/bin/env node
// Backfill de UMA VEZ (unidade "papéis e permissões"): tenants que já
// existiam antes da migração 20260912000000 ganham os grupos "Operador"/
// "Gestor" que TenantsService.create() já semeia sozinho para tenant
// NOVO. Não é um script de rotina (por isso não está em package.json) —
// roda uma vez, contra o banco de hoje, e depois não tem mais função:
// todo tenant criado depois já nasce com os grupos.
//
// Por que não é SQL na própria migração: D-015 exige UUID v7 gerado na
// APLICAÇÃO, sem exceção — gen_random_uuid() no SQL da migração geraria
// v4, o mesmo caminho de identificador duplicado que a D-030 já recusou
// para trigger. TenantsService.seedDefaultGroups() já existe e gera os
// IDs do jeito certo; este script só chama esse método pra cada tenant
// que ainda não tem grupo — idempotente, seguro rodar mais de uma vez.
//
// Uso: node scripts/backfill-tenant-groups.mjs (dentro de backend/,
// com DATABASE_URL do .env carregado — mesmo ambiente de qualquer
// migração).
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TenantsService } from '../dist/tenant/tenants.service.js';

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const tenantsService = new TenantsService();

const tenants = await admin.tenant.findMany({ select: { id: true, name: true } });
console.log(`Encontrados ${tenants.length} tenants.`);

for (const tenant of tenants) {
  await admin.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, TRUE)`;
    await tenantsService.seedDefaultGroups(tx, tenant.id);
  });
  console.log(`  ${tenant.name} (${tenant.id}) — grupos garantidos.`);
}

await admin.$disconnect();
console.log('Backfill concluído.');
