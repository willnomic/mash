import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { TenantSettingsController } from './tenant-settings.controller.js';
import { TenantSettingsService } from './tenant-settings.service.js';

@Module({
  imports: [TenantModule],
  controllers: [TenantSettingsController],
  providers: [TenantSettingsService],
})
export class TenantSettingsModule {}
