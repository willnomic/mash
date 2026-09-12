import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { IS_PUBLIC_KEY } from '../auth/public.decorator.js';
import { SessionService } from '../auth/session.service.js';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie.js';

// Métodos que não mudam estado — dispensados da checagem de Origin
// abaixo (D-048).
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Global (registrado como APP_GUARD em TenantModule): toda rota exige
// sessão válida, exceto as marcadas com @Public(). tenantId vem sempre
// da sessão, nunca de body, query string ou header escolhido pelo
// cliente (D-012) — é o guard, e só o guard, que decide o que vai para
// o ClsService.
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();

    // CSRF (D-048): "validação de Origin no backend como mínimo, já que
    // a autenticação é por cookie" — SameSite=Lax já barra a maior parte
    // dos casos; isto cobre o resto, só em método que muda estado.
    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (!origin || origin !== process.env.FRONTEND_ORIGIN) {
        throw new ForbiddenException('Origem não permitida');
      }
    }

    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException('Sessão ausente');
    }

    const session = await this.sessions.validate(token);
    if (!session) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    this.cls.set('tenantId', session.tenantId);
    this.cls.set('userId', session.userId);
    this.cls.set('role', session.role);
    // Lido por PermissionGuard, o próximo guard da cadeia (unidade
    // "papéis e permissões") — nunca pelo próprio TenantGuard, que só
    // resolve QUEM está logado, nunca O QUE pode fazer (D-009).
    this.cls.set('isAdmin', session.isAdmin);
    this.cls.set('permissions', session.permissions);

    return true;
  }
}
