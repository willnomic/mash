import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { MeModule } from './me/me.module.js';

@Module({
  imports: [
    // AsyncLocalStorage, não provider REQUEST-scoped — escopo de requisição
    // contaminaria toda a cadeia de dependências (docs/d012, Passo 4).
    // global: true — senão ClsService só resolve dentro de AppModule, e
    // todo módulo novo que precisar dele teria que lembrar de reimportar
    // ClsModule (o mesmo risco de "esquecer" que o RLS evita em D-012).
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    AuthModule,
    TenantModule,
    MeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
