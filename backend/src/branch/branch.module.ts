import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { BranchController } from './branch.controller.js';

@Module({
  imports: [TenantModule],
  controllers: [BranchController],
})
export class BranchModule {}
