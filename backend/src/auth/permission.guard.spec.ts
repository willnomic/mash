import { describe, expect, it } from 'vitest';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ClsService } from 'nestjs-cls';
import { PermissionGuard } from './permission.guard.js';

// Guarda o comportamento central da unidade "papéis e permissões", item
// 4: endpoint sem @Public()/@RequirePermission()/@NoPermissionRequired()
// é erro de PROGRAMAÇÃO, nunca passe livre. Fake mínimo de Reflector e
// ClsService — o guard só usa getAllAndOverride() e get(), nenhuma
// dependência real do Nest precisa subir pra testar isso.
function makeContext(): ExecutionContext {
  return {
    getHandler: () => function exampleHandler() {},
    getClass: () => class ExampleController {},
  } as unknown as ExecutionContext;
}

function makeReflector(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

function makeCls(values: Record<string, unknown>): ClsService {
  return {
    get: (key: string) => values[key],
  } as unknown as ClsService;
}

describe('PermissionGuard', () => {
  it('rota @Public() passa sem checar nada', () => {
    const guard = new PermissionGuard(makeCls({}), makeReflector({ isPublic: true }));
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('rota sem @Public(), sem @RequirePermission() e sem @NoPermissionRequired() lança erro de programação', () => {
    const guard = new PermissionGuard(makeCls({}), makeReflector({}));
    expect(() => guard.canActivate(makeContext())).toThrow(
      InternalServerErrorException,
    );
  });

  it('@NoPermissionRequired() passa sem checar isAdmin/permissions', () => {
    const guard = new PermissionGuard(
      makeCls({}),
      makeReflector({ noPermissionRequired: true }),
    );
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('isAdmin ignora a permissão exigida e passa sempre', () => {
    const guard = new PermissionGuard(
      makeCls({ isAdmin: true, permissions: new Set() }),
      makeReflector({ requiredPermission: 'quote.view' }),
    );
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('usuário com a permissão exigida passa', () => {
    const guard = new PermissionGuard(
      makeCls({ isAdmin: false, permissions: new Set(['quote.view']) }),
      makeReflector({ requiredPermission: 'quote.view' }),
    );
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('usuário SEM a permissão exigida recebe 403 — recusa é do backend, não só da tela', () => {
    const guard = new PermissionGuard(
      makeCls({ isAdmin: false, permissions: new Set(['quote.view']) }),
      makeReflector({ requiredPermission: 'settings.view' }),
    );
    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
  });

  it('usuário sem grupo (permissions undefined) e sem isAdmin recebe 403', () => {
    const guard = new PermissionGuard(
      makeCls({ isAdmin: false }),
      makeReflector({ requiredPermission: 'quote.view' }),
    );
    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
  });
});
