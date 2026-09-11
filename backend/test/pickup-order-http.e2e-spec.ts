import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { v7 as uuidv7 } from 'uuid';
import { AppModule } from '../src/app.module.js';
import { base } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedPickupOrderScenario } from './helpers/seed-pickup-order-scenario.js';

// Roda a aplicação Nest inteira (não mock: prova o wiring ponta a ponta —
// rota, TenantGuard, RLS via token — não só a função de geração do PDF).
// A validação profunda do conteúdo do PDF (páginas, texto extraído) já é
// feita em pickup-order-pdf.e2e-spec.ts direto no service, com Buffer
// real; aqui o alvo é a rota em si.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "PickupOrderItem", "PickupOrder", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant", "User" CASCADE`;

// Extrai só "session=<token>" do Set-Cookie da resposta de login — mesmo
// helper de auth.e2e-spec.ts (D-048: cookie httpOnly, não mais token no
// corpo).
function sessionCookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'] as string[] | undefined;
  const sessionCookie = setCookie?.find((c) => c.startsWith('session='));
  if (!sessionCookie) {
    throw new Error('login não devolveu cookie de sessão');
  }
  return sessionCookie.split(';')[0];
}

describe('PickupOrder · rota HTTP (D-027)', () => {
  let app: INestApplication<App>;
  const password = 'senha-forte-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
  });

  it('sem token, retorna 401', async () => {
    await request(app.getHttpServer())
      .get(`/pickup-orders/${uuidv7()}/pdf`)
      .expect(401);
  });

  it('com token válido, devolve o PDF com Content-Type correto', async () => {
    const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1);
    const passwordHash = await argon2.hash(password);
    await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        email: 'operador@a.com',
        passwordHash,
        name: 'Operador A',
        role: 'OPERATOR',
        active: true,
      },
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: seed.tenant.slug, email: 'operador@a.com', password })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/pickup-orders/${seed.pickupOrder.id}/pdf`)
      .set('Cookie', sessionCookieFrom(login))
      .expect(200);

    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('PickupOrder de outro tenant (mesmo id inexistente pro token) retorna erro, não vaza dado', async () => {
    const seedA = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1);
    const seedB = await seedPickupOrderScenario(admin, 'B', 'transportadora-b', 1);
    const passwordHash = await argon2.hash(password);
    await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: seedA.tenant.id,
        email: 'operador@a.com',
        passwordHash,
        name: 'Operador A',
        role: 'OPERATOR',
        active: true,
      },
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: seedA.tenant.slug, email: 'operador@a.com', password })
      .expect(201);

    // Tenta pegar o PDF de uma ordem de coleta do tenant B usando o token
    // do tenant A — RLS bloqueia a leitura, o service não encontra a
    // linha (findUniqueOrThrow) e a rota responde erro, nunca o PDF do
    // tenant errado.
    await request(app.getHttpServer())
      .get(`/pickup-orders/${seedB.pickupOrder.id}/pdf`)
      .set('Cookie', sessionCookieFrom(login))
      .expect(500);
  });
});
