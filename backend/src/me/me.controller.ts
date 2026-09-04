import { Controller, Get } from '@nestjs/common';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

// Superfície mínima para provar o wiring do RLS (D-012): nunca lê tenantId
// de body, query ou header — só o que o TenantGuard extraiu do token.
@Controller('me')
export class MeController {
  constructor(private readonly tenantPrisma: TenantPrisma) {}

  @Get('users')
  users() {
    return this.tenantPrisma.db.user.findMany({
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
  }
}
