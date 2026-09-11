import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService],
  // Exporta SessionService para o TenantGuard validar o mesmo tipo de
  // sessão (D-3.2, uma definição só) — substitui o JwtModule da D-029.
  exports: [SessionService],
})
export class AuthModule {}
