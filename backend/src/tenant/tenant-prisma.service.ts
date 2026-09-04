import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { forTenant } from '../prisma/prisma-tenant.js';

// Serviços injetam TenantPrisma e usam this.tenantPrisma.db.<model> — o
// tenantId nunca aparece no código de negócio (docs/d012-multi-tenant-rls.md,
// Passo 4).
@Injectable()
export class TenantPrisma {
  constructor(private readonly cls: ClsService) {}

  get db() {
    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) {
      throw new InternalServerErrorException('tenant ausente no contexto');
    }
    return forTenant(tenantId);
  }
}
