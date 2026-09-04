import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '8h' }, // um turno de trabalho (contexto.md)
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // Exporta JwtModule para o TenantGuard verificar o mesmo token com a
  // mesma configuração — uma definição só (D-3.2).
  exports: [JwtModule],
})
export class AuthModule {}
