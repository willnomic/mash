import { BadRequestException, Controller, Post, Body, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { loginSchema } from '@mash/shared';
import { Public } from './public.decorator.js';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Corpo de resposta vazio de propósito (D-048): o frontend nunca vê o
  // token, só o cookie httpOnly. Dados do usuário vêm de GET /me.
  @Public()
  @Post('login')
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { token, expiresAt } = await this.authService.login(parsed.data);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
  }

  // Não marcado @Public(): passa pelo TenantGuard, que já valida a
  // sessão do cookie — chega aqui só com um token que existia de
  // verdade. Idempotente (SessionService.revoke não erra em token
  // desconhecido), então funciona igual mesmo chamado duas vezes.
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (token) {
      await this.authService.logout(token);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  }
}
