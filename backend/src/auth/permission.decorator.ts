import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@mash/shared';

export const PERMISSION_KEY = 'requiredPermission';

// Marca a permissão que o endpoint exige (unidade "papéis e
// permissões") — PermissionGuard lê isto pra decidir. Recusa NÃO é
// implícita/ausência-de-decorator: um endpoint sem @RequirePermission()
// e sem @NoPermissionRequired() é erro de PROGRAMAÇÃO (o guard lança
// InternalServerErrorException), nunca "passa livre".
export const RequirePermission = (code: PermissionCode) =>
  SetMetadata(PERMISSION_KEY, code);

export const NO_PERMISSION_REQUIRED_KEY = 'noPermissionRequired';

// Marca um endpoint que exige sessão válida (TenantGuard já cobre isso)
// mas NENHUMA permissão de negócio específica — identidade, não
// capacidade. Hoje: GET /me, GET /me/users (superfície mínima de prova
// de RLS, não é a tela de gerenciar usuários — essa é outra unidade) e
// POST /auth/logout. Existe pelo mesmo motivo do @RequirePermission():
// tornar "não decidi" impossível de escrever sem que o guard reclame.
export const NoPermissionRequired = () =>
  SetMetadata(NO_PERMISSION_REQUIRED_KEY, true);
