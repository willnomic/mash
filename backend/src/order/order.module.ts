import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [TenantModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
