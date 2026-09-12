import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import {
  NO_PERMISSION_REQUIRED_KEY,
  PERMISSION_KEY,
} from './permission.decorator.js';

// Segundo guard global (registrado depois do TenantGuard em
// TenantModule — Nest roda APP_GUARD na ordem de registro, e este só
// faz sentido depois que TenantGuard já resolveu a sessão em CLS).
// Papel (D-009): "o que se pode fazer" — nunca mistura com tenantId
// (isolamento é RLS/TenantGuard, D-012), só lê o que já está em CLS.
//
// "Endpoint sem permissão declarada é erro de programação, não passe
// livre" (unidade "papéis e permissões", item 4): rota que não tem
// @Public(), @RequirePermission() nem @NoPermissionRequired() lança
// InternalServerErrorException — não HÁ terceiro caminho silencioso.
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const noPermissionRequired = this.reflector.getAllAndOverride<boolean>(
      NO_PERMISSION_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!noPermissionRequired && !requiredPermission) {
      const handler = context.getClass().name + '.' + context.getHandler().name;
      throw new InternalServerErrorException(
        `Endpoint sem permissão declarada: ${handler}(). Adicione ` +
          '@RequirePermission(code) ou @NoPermissionRequired().',
      );
    }

    if (noPermissionRequired) {
      // TenantGuard já exigiu sessão válida pra chegar até aqui.
      return true;
    }

    if (this.cls.get<boolean>('isAdmin')) {
      // Ignora grupo, tem tudo — "evita a transportadora se trancar
      // pra fora" (o pedido).
      return true;
    }

    const permissions = this.cls.get<Set<string>>('permissions');
    if (!permissions?.has(requiredPermission as string)) {
      throw new ForbiddenException('Permissão insuficiente.');
    }

    return true;
  }
}
