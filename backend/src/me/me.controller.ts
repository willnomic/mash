import { Controller, Get } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { NoPermissionRequired } from '../auth/permission.decorator.js';
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
  // lá), nunca de body/query/header. Identidade, não capacidade de
  // negócio — @NoPermissionRequired() (unidade "papéis e permissões"):
  // todo usuário autenticado pode saber quem é, sem exigir permissão
  // nenhuma.
  //
  // isAdmin/permissions vêm de CLS (TenantGuard já resolveu, mesma
  // consulta que valida a sessão) — a casca esconde o que a lista de
  // permissões não cobre (item 5).
  @NoPermissionRequired()
  @Get()
  async me() {
    const userId = this.cls.get<string>('userId');
    const isAdmin = this.cls.get<boolean>('isAdmin');
    const permissions = this.cls.get<Set<string>>('permissions');
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
    return {
      ...user,
      isAdmin: isAdmin ?? false,
      permissions: Array.from(permissions ?? []),
    };
  }

  // Superfície mínima para provar o wiring do RLS (D-012): nunca lê tenantId
  // de body, query ou header — só o que o TenantGuard extraiu da sessão.
  // Não é a tela de gerenciar usuários (fora de escopo desta unidade) —
  // tratado como identidade/depuração, mesmo critério de GET /me.
  @NoPermissionRequired()
  @Get('users')
  users() {
    return this.tenantPrisma.db.user.findMany({
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
  }
}
