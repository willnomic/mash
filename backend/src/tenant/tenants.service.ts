import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { base } from '../prisma/prisma-tenant.js';
import type { Prisma, Tenant } from '@prisma/client';

const DEFAULT_BRANCH_NAME = 'Matriz';

// Grupos semeados (unidade "papéis e permissões", item 3) — por
// TENANT, não globais: "cada transportadora altera, exclui ou duplica"
// exige que editar o grupo de uma transportadora nunca afete outra.
// Diferente de QuoteStatus/DayPeriod (tenantId nulo = linha
// compartilhada, nunca editada pelo tenant), Group nasce DENTRO de cada
// tenant, mesmo mecanismo que já semeia a filial padrão (D-030) — só
// que agora reaproveitado também para tenant que já existia (ver
// scripts/backfill-tenant-groups.mjs).
const OPERADOR_PERMISSION_CODES = [
  'quote.view',
  'quote.create',
  'quote.close',
  'quote.accept',
  'quote.reject',
  'registration.view',
  'registration.create',
] as const;
// Gestor = tudo do operador mais configuração — não uma lista própria,
// pra nunca divergir se um permission novo entrar no fluxo comercial.
const GESTOR_EXTRA_PERMISSION_CODES = ['settings.view', 'settings.change'] as const;

@Injectable()
export class TenantsService {
  // Única porta de entrada para criar tenant: Tenant, filial padrão e
  // grupos padrão nascem juntos, na mesma transação (D-011/D-030). IDs
  // em UUID v7, gerados aqui — não no banco (D-015; Postgres 17 não tem
  // uuidv7() nativo, e um trigger reimplementando o algoritmo seria a
  // "solução esperta e única" que o projeto evita).
  async create(input: { name: string; slug: string }): Promise<Tenant> {
    const tenantId = uuidv7();

    return base.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

      const tenant = await tx.tenant.create({
        data: { id: tenantId, name: input.name, slug: input.slug },
      });

      await tx.branch.create({
        data: { id: uuidv7(), tenantId, name: DEFAULT_BRANCH_NAME },
      });

      await this.seedDefaultGroups(tx, tenantId);

      return tenant;
    });
  }

  // Extraído pra ser reaproveitado pelos tenants que já existiam antes
  // desta unidade (backfill único, fora da migração — ver
  // scripts/backfill-tenant-groups.mjs e o comentário na migração
  // 20260912000000 sobre por que o backfill não é SQL cru). Idempotente:
  // não faz nada se o tenant já tem um grupo chamado "Operador" — evita
  // duplicar se o script rodar duas vezes.
  async seedDefaultGroups(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    const alreadySeeded = await tx.group.findFirst({
      where: { tenantId, name: 'Operador' },
    });
    if (alreadySeeded) {
      return;
    }

    const allPermissions = await tx.permission.findMany();
    const operadorId = uuidv7();
    const gestorId = uuidv7();

    await tx.group.createMany({
      data: [
        { id: operadorId, tenantId, name: 'Operador' },
        { id: gestorId, tenantId, name: 'Gestor' },
      ],
    });

    const operadorPermissionIds = allPermissions
      .filter((p) => (OPERADOR_PERMISSION_CODES as readonly string[]).includes(p.code))
      .map((p) => p.id);
    const gestorPermissionIds = allPermissions
      .filter(
        (p) =>
          (OPERADOR_PERMISSION_CODES as readonly string[]).includes(p.code) ||
          (GESTOR_EXTRA_PERMISSION_CODES as readonly string[]).includes(p.code),
      )
      .map((p) => p.id);

    await tx.groupPermission.createMany({
      data: [
        ...operadorPermissionIds.map((permissionId) => ({
          id: uuidv7(),
          tenantId,
          groupId: operadorId,
          permissionId,
        })),
        ...gestorPermissionIds.map((permissionId) => ({
          id: uuidv7(),
          tenantId,
          groupId: gestorId,
          permissionId,
        })),
      ],
    });
  }
}
