import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { IS_PUBLIC_KEY } from '../auth/public.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

// Global (registrado como APP_GUARD em TenantModule): toda rota exige token
// válido, exceto as marcadas com @Public(). tenantId vem sempre do token,
// nunca de body, query string ou header escolhido pelo cliente (D-012) —
// é o guard, e só o guard, que decide o que vai para o ClsService.
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
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
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Token ausente');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    this.cls.set('tenantId', payload.tenantId);
    this.cls.set('userId', payload.sub);
    this.cls.set('role', payload.role);

    return true;
  }
}
