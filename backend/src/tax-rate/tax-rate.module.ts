import { Module } from '@nestjs/common';
import { TaxRateService } from './tax-rate.service.js';

@Module({
  providers: [TaxRateService],
  exports: [TaxRateService],
})
export class TaxRateModule {}
