import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { base } from '../prisma/prisma-tenant.js';
import type { Tenant } from '@prisma/client';

const DEFAULT_BRANCH_NAME = 'Matriz';

@Injectable()
export class TenantsService {
  // Única porta de entrada para criar tenant: Tenant e a filial padrão
  // nascem juntos, na mesma transação (D-011). IDs em UUID v7, gerados
  // aqui — não no banco (D-015; Postgres 17 não tem uuidv7() nativo, e um
  // trigger reimplementando o algoritmo seria a "solução esperta e única"
  // que o projeto evita).
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

      return tenant;
    });
  }
}
