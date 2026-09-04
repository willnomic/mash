import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { QuoteService } from './quote.service.js';

@Module({
  imports: [TenantModule],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
