import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { PartyController } from './party.controller.js';
import { CnpjLookupService } from './cnpj-lookup.service.js';

@Module({
  imports: [TenantModule],
  controllers: [PartyController],
  providers: [CnpjLookupService],
})
export class PartyModule {}
