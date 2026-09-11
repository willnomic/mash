import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { PartyController } from './party.controller.js';

@Module({
  imports: [TenantModule],
  controllers: [PartyController],
})
export class PartyModule {}
