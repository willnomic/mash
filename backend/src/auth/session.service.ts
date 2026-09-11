import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { base, forTenant } from '../prisma/prisma-tenant.js';
import type { SessionContext } from './session-context.js';

// Um turno de trabalho (contexto.md) — mesma duração que o JWT tinha
// antes da D-048.
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class SessionService {
  // Token opaco (D-048) — 32 bytes de aleatoriedade criptográfica, não
  // uuidv7 (D-015 é pra identificador de linha; aqui o valor É o segredo
  // portador da autenticação, precisa da entropia de um token dedicado).
  async create(input: {
    tenantId: string;
    userId: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await forTenant(input.tenantId).session.create({
      data: {
        token,
        tenantId: input.tenantId,
        userId: input.userId,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  // SELECT público (RLS, migração 20260911010000) — validar precisa
  // funcionar antes de existir tenant definido na conexão, porque é a
  // própria sessão que informa qual é o tenant (mesmo problema
  // ovo-e-galinha que a D-029 já resolveu pra Tenant.slug). Duas
  // consultas, não um `include`: User é isolado por tenant do jeito
  // normal (D-012) — um `include` aqui rodaria SEM tenant definido
  // ainda e o RLS de User devolveria null silenciosamente, não o
  // usuário certo. Só depois de saber o tenantId da Session (leitura
  // pública) dá pra ler o User pelo caminho escopado de sempre.
  async validate(token: string): Promise<SessionContext | null> {
    const session = await base.session.findUnique({ where: { token } });
    if (!session) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    const user = await forTenant(session.tenantId).user.findUnique({
      where: { id: session.userId },
    });
    // Usuário inativado (D-017) ou apagado: derruba a sessão mesmo que a
    // linha ainda não tenha expirado — é o motivo decisivo da D-048 pra
    // sessão opaca (JWT só expirando não permitiria isso).
    if (!user || !user.active) {
      return null;
    }

    return {
      userId: session.userId,
      tenantId: session.tenantId,
      role: user.role,
    };
  }

  // Relê o token por SELECT público pra descobrir o tenant, só então
  // apaga escopado (a política de DELETE exige tenant isolado, D-012).
  // Token desconhecido ou já apagado: no-op — logout é idempotente.
  async revoke(token: string): Promise<void> {
    const session = await base.session.findUnique({ where: { token } });
    if (!session) {
      return;
    }
    await forTenant(session.tenantId).session.delete({ where: { token } });
  }
}
