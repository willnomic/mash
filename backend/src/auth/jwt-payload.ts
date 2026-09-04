import { UserRole } from '@prisma/client';

// Papel define o que se pode fazer (D-009); tenant define quais dados
// existem (D-012). O guard nunca mistura as duas lógicas.
export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
}
