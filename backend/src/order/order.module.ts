import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { NumberingModule } from '../numbering/numbering.module.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [TenantModule, NumberingModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
