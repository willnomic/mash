import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { MeController } from './me.controller.js';

@Module({
  imports: [TenantModule],
  controllers: [MeController],
})
export class MeModule {}
