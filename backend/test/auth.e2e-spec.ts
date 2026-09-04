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

// Roda contra o PostgreSQL real do docker-compose e sobe a aplicação Nest
// inteira (não mock: RLS é do banco, e o que este arquivo prova é o wiring
// ponta a ponta — login, guard, ClsService, TenantPrisma).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Auth · login e wiring do tenant (D-012, D-029)', () => {
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
    await admin.$disconnect();
    await base.$disconnect();
  });

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "User", "Tenant" CASCADE`;
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

  it('login válido devolve um token com tenantId e role do usuário', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'operador@a.com', password })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));

    const [, payloadB64] = res.body.accessToken.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString(),
    );
    expect(payload.tenantId).toBe(tenantA.id);
    expect(payload.role).toBe('OPERATOR');
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

  it('rota protegida sem token retorna 401', async () => {
    await request(app.getHttpServer()).get('/me/users').expect(401);
  });

  it('rota protegida com token inválido retorna 401', async () => {
    await request(app.getHttpServer())
      .get('/me/users')
      .set('Authorization', 'Bearer token-forjado')
      .expect(401);
  });

  it('tenantId usado na consulta vem do token, nunca do que o cliente manda', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ slug: tenantA.slug, email: 'operador@a.com', password })
      .expect(201);

    // Tenta forjar o tenant B por header e por query string — o handler
    // nunca lê nenhum dos dois, só o que o guard extraiu do token.
    const res = await request(app.getHttpServer())
      .get('/me/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Tenant-Id', tenantB.id)
      .query({ tenantId: tenantB.id })
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(
      res.body.every((u: { tenantId: string }) => u.tenantId === tenantA.id),
    ).toBe(true);
  });
});
