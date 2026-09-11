import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { base, forTenant } from '../prisma/prisma-tenant.js';
import { SessionService } from './session.service.js';
import type { LoginInput } from '@mash/shared';

// Mesma mensagem para slug, e-mail ou senha errados — não dar pista de qual
// parte falhou.
const INVALID_CREDENTIALS = 'Credenciais inválidas';

@Injectable()
export class AuthService {
  constructor(private readonly sessions: SessionService) {}

  async login(input: LoginInput): Promise<{ token: string; expiresAt: Date }> {
    // Leitura de Tenant é pública (D-029): resolve o slug antes de existir
    // tenant definido na sessão.
    const tenant = await base.tenant.findUnique({
      where: { slug: input.slug },
    });
    if (!tenant) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const user = await forTenant(tenant.id).user.findFirst({
      where: { email: input.email },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      input.password,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.sessions.create({ tenantId: user.tenantId, userId: user.id });
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
  }
}
