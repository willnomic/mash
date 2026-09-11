import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // cookie-parser vem de AppModule.configure() (aplica em qualquer forma
  // de bootstrap, inclusive nos testes e2e que não passam por aqui).
  // Frontend roda em origem diferente em dev (porta do Vite) — cookie
  // httpOnly exige credentials:'include' no fetch E CORS explícito com
  // credentials:true (curinga '*' não funciona com cookie).
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
