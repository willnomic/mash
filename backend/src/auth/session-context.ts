import type { UserRole } from '@prisma/client';

// Papel define o que se pode fazer (D-009); tenant define quais dados
// existem (D-012). O guard nunca mistura as duas lógicas. Substitui
// jwt-payload.ts (D-048, unidade "a casca do frontend" — sessão opaca em
// vez de JWT).
//
// isAdmin/permissions (unidade "papéis e permissões"): resolvidos aqui,
// não no guard — SessionService.validate() já lê User a cada requisição
// (D-048, pra derrubar sessão de usuário inativado na hora), então
// calcular as permissões efetivas junto não é uma consulta a mais.
// `role` (UserRole) permanece por compatibilidade — não é lido por
// nenhuma decisão de autorização (achado desta unidade, relatado, não
// removido: fora de escopo tocar todo teste que cria User só por isso).
export interface SessionContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  isAdmin: boolean;
  permissions: Set<string>;
}
