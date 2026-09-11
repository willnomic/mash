import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { TaxRateModule } from '../tax-rate/tax-rate.module.js';
import { OrderModule } from '../order/order.module.js';
import { QuoteService } from './quote.service.js';

@Module({
  imports: [TenantModule, TaxRateModule, OrderModule],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
