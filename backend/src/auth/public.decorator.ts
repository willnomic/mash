import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca uma rota como isenta do TenantGuard — hoje só o login, que roda
// antes de existir token nenhum.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
