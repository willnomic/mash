import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { TaxRateService } from './tax-rate.service.js';
import { TaxRateController } from './tax-rate.controller.js';

@Module({
  imports: [TenantModule],
  controllers: [TaxRateController],
  providers: [TaxRateService],
  exports: [TaxRateService],
})
export class TaxRateModule {}
