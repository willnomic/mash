import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { TenantGuard } from './tenant.guard.js';
import { TenantPrisma } from './tenant-prisma.service.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [AuthModule],
  providers: [
    TenantPrisma,
    TenantsService,
    { provide: APP_GUARD, useClass: TenantGuard },
    // Ordem importa (unidade "papéis e permissões"): Nest roda os
    // APP_GUARD na ordem de registro, e PermissionGuard depende de
    // isAdmin/permissions que só existem em CLS depois que TenantGuard
    // rodou. Registrado por ÚLTIMO de propósito.
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [TenantPrisma, TenantsService],
})
export class TenantModule {}
