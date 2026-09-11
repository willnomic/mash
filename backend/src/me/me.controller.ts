import { Controller, Get } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrisma } from '../tenant/tenant-prisma.service.js';

@Controller('me')
export class MeController {
  constructor(
    private readonly tenantPrisma: TenantPrisma,
    private readonly cls: ClsService,
  ) {}

  // D-048: o frontend busca isto na abertura pra saber quem está logado
  // e qual tenant — o cookie não carrega nada legível, só o token opaco.
  // userId vem do ClsService (TenantGuard já validou a sessão e gravou
  // lá), nunca de body/query/header.
  @Get()
  async me() {
    const userId = this.cls.get<string>('userId');
    const user = await this.tenantPrisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });
    return user;
  }

  // Superfície mínima para provar o wiring do RLS (D-012): nunca lê tenantId
  // de body, query ou header — só o que o TenantGuard extraiu da sessão.
  @Get('users')
  users() {
    return this.tenantPrisma.db.user.findMany({
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
  }
}
