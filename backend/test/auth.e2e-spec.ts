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

// Roda contra o PostgreSQL real do docker-compose e sobe a aplicação Nest
// inteira (não mock: RLS é do banco, e o que este arquivo prova é o wiring
// ponta a ponta — login, cookie de sessão, guard, ClsService, TenantPrisma
// — D-048).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Extrai só "session=<token>" do Set-Cookie da resposta de login, pra
// reenviar em requisições seguintes — supertest não é um navegador, não
// persiste cookie sozinho entre chamadas soltas (`request(app)` cria uma
// conexão nova a cada `.post()`/`.get()`).
function sessionCookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'] as string[] | undefined;
  const sessionCookie = setCookie?.find((c) => c.startsWith('session='));
  if (!sessionCookie) {
    throw new Error('login não devolveu cookie de sessão');
  }
  return sessionCookie.split(';')[0];
}

describe('Auth · login e wiring do tenant (D-012, D-029, D-048)', () => {
  let app: INestApplication<App>;
  let tenantA: { id: string; slug: string };
  let tenantB: { id: string; slug: string };
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
    await admin.$executeRaw`TRUNCATE TABLE "User", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "User", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    const passwordHash = await argon2.hash(password);

    tenantA = await admin.tenant.create({
      data: {
        id: uuidv7(),
        name: 'Transportadora A',
        slug: 'transportadora-a',
      },
    });
    tenantB = await admin.tenant.create({
      data: {
        id: uuidv7(),
        name: 'Transportadora B',
        slug: 'transportadora-b',
      },
    });

    await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        email: 'operador@a.com',
        passwordHash,
        name: 'Operador A',
        role: 'OPERATOR',
        active: true,
      },
    });
    await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        email: 'inativo@a.com',
        passwordHash,
        name: 'Ex-operador A',
        role: 'OPERATOR',
        active: false,
      },
    });
    await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        email: 'operador@b.com',
        passwordHash,
        name: 'Operador B',
        role: 'OPERATOR',
        active: true,
      },
    });
  });

  it('login válido seta cookie de sessão httpOnly — corpo não carrega nenhum token (D-048)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'operador@a.com', password })
      .expect(201);

    expect(res.body).toEqual({});

    const setCookie = res.headers['set-cookie'] as string[];
    const sessionCookie = setCookie.find((c) => c.startsWith('session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
  });

  it('GET /me devolve os dados do usuário da sessão, não de body/query', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'operador@a.com', password })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', sessionCookieFrom(login))
      .expect(200);

    expect(res.body.email).toBe('operador@a.com');
    expect(res.body.tenant.id).toBe(tenantA.id);
    expect(res.body.tenant.slug).toBe(tenantA.slug);
  });

  it('rejeita senha errada', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'operador@a.com', password: 'errada' })
      .expect(401);
  });

  it('rejeita slug inexistente', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: 'nao-existe', email: 'operador@a.com', password })
      .expect(401);
  });

  it('rejeita usuário inativo', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'inativo@a.com', password })
      .expect(401);
  });

  it('rejeita corpo de login fora do formato esperado', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'não é e-mail', password })
      .expect(400);
  });

  it('rota protegida sem cookie de sessão retorna 401', async () => {
    await request(app.getHttpServer()).get('/me/users').expect(401);
  });

  it('rota protegida com cookie forjado retorna 401', async () => {
    await request(app.getHttpServer())
      .get('/me/users')
      .set('Cookie', 'session=token-forjado')
      .expect(401);
  });

  it('tenantId usado na consulta vem da sessão, nunca do que o cliente manda', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'operador@a.com', password })
      .expect(201);
    const cookie = sessionCookieFrom(login);

    // Tenta forjar o tenant B por header e por query string — o handler
    // nunca lê nenhum dos dois, só o que o guard extraiu da sessão.
    const res = await request(app.getHttpServer())
      .get('/me/users')
      .set('Cookie', cookie)
      .set('X-Tenant-Id', tenantB.id)
      .query({ tenantId: tenantB.id })
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(
      res.body.every((u: { tenantId: string }) => u.tenantId === tenantA.id),
    ).toBe(true);
  });

  it('logout derruba a sessão na hora — mesmo cookie não funciona mais depois (D-048)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'operador@a.com', password })
      .expect(201);
    const cookie = sessionCookieFrom(login);

    await request(app.getHttpServer())
      .get('/me/users')
      .set('Cookie', cookie)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', process.env.FRONTEND_ORIGIN as string)
      .expect(201);

    await request(app.getHttpServer())
      .get('/me/users')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('CSRF: método que muda estado sem Origin correta é recusado, mesmo com sessão válida (D-048)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'operador@a.com', password })
      .expect(201);
    const cookie = sessionCookieFrom(login);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'https://site-malicioso.example')
      .expect(403);
  });
});
