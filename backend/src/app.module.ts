import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import cookieParser from 'cookie-parser';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { MeModule } from './me/me.module.js';
import { QuoteModule } from './quote/quote.module.js';
import { OrderModule } from './order/order.module.js';
import { PickupOrderModule } from './pickup-order/pickup-order.module.js';
import { PartyModule } from './party/party.module.js';
import { BranchModule } from './branch/branch.module.js';

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
    QuoteModule,
    OrderModule,
    PickupOrderModule,
    PartyModule,
    BranchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  // Aqui, não em main.ts: main.ts nunca roda nos testes e2e (eles montam
  // a aplicação direto de AppModule via Test.createTestingModule), então
  // um app.use(cookieParser()) só em main.ts deixaria req.cookies
  // undefined em todo teste HTTP — TenantGuard (D-048) depende disto pra
  // ler o cookie de sessão.
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cookieParser()).forRoutes('*');
  }
}
