import type { UserRole } from '@prisma/client';

// Papel define o que se pode fazer (D-009); tenant define quais dados
// existem (D-012). O guard nunca mistura as duas lógicas. Substitui
// jwt-payload.ts (D-048, unidade "a casca do frontend" — sessão opaca em
// vez de JWT).
export interface SessionContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}
