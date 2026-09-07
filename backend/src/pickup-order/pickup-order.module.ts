import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { PickupOrderController } from './pickup-order.controller.js';
import { PickupOrderService } from './pickup-order.service.js';

@Module({
  imports: [TenantModule],
  controllers: [PickupOrderController],
  providers: [PickupOrderService],
  exports: [PickupOrderService],
})
export class PickupOrderModule {}
