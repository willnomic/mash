import type { CookieOptions } from 'express';

// Nome único, usado pelo controller (grava) e pelo guard (lê) — D-3.2,
// uma definição só.
export const SESSION_COOKIE_NAME = 'session';

// D-048: httpOnly (frontend nunca lê o valor em JS), Secure (exige
// contexto seguro — localhost conta como seguro nos navegadores atuais,
// 127.0.0.1 não necessariamente; ver docs/estado.md), SameSite=Lax. Sem
// Domain — vazaria sessão entre tenants se um dia existir subdomínio por
// tenant (D-029/D-048 já recusaram essa rota).
export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}
