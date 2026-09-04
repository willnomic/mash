import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { TenantGuard } from './tenant.guard.js';
import { TenantPrisma } from './tenant-prisma.service.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [AuthModule],
  providers: [
    TenantPrisma,
    TenantsService,
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [TenantPrisma, TenantsService],
})
export class TenantModule {}
