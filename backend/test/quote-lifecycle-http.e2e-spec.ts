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
import { ensureQuoteCostTypesSeeded } from './helpers/seed-quote-cost-types.js';
import { ensureOrderStatusesSeeded } from './helpers/seed-order-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';

// Roda a aplicação Nest inteira (mesmo critério de
// quote-cost-based-http.e2e-spec.ts) — prova o wiring ponta a ponta das
// rotas novas da unidade "cotação por custo, parte 2": GET /quotes/:id,
// POST /quotes/:id/close, POST /quotes/:id/accept, POST
// /quotes/:id/reject, GET /parties, GET /branches. As guardas de
// negócio em si (vencida, já tem desfecho, prazo obrigatório) já são
// provadas contra o service em quote-lifecycle.e2e-spec.ts — aqui o
// alvo é o mapeamento HTTP: código de status, formato de erro, e a
// idempotência do aceite alcançada de fora (duplo POST), não só lida no
// código.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Trip", "Order", "QuoteCostLine", "Quote", "QuoteCostType", "QuoteStatus", "Party", "Tenant" CASCADE`;

async function reseedShared() {
  await ensureQuoteStatusesSeeded(admin);
  await ensureQuoteCostTypesSeeded(admin);
  await ensureOrderStatusesSeeded(admin);
  await ensureTripStatusesSeeded(admin);
}

function sessionCookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'] as string[] | undefined;
  const sessionCookie = setCookie?.find((c) => c.startsWith('session='));
  if (!sessionCookie) {
    throw new Error('login não devolveu cookie de sessão');
  }
  return sessionCookie.split(';')[0];
}

describe('Cotação por custo · rotas HTTP, parte 2 (fechar/aceitar/recusar)', () => {
  let app: INestApplication<App>;
  const password = 'senha-forte-123';
  let tenant: { id: string; slug: string };
  let branch: { id: string };
  let party: { id: string };
  let cookie: string;
  let freightTypeId: string;

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
    await reseedShared();
    await admin.$disconnect();
    await base.$disconnect();
  });

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await reseedShared();

    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    branch = await admin.branch.create({
      data: { id: uuidv7(), tenantId: tenant.id, name: 'Matriz' },
    });
    party = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Cliente A',
        cnpj: '11444777000161',
      },
    });
    freightTypeId = (
      await admin.quoteCostType.findFirstOrThrow({ where: { code: 'FREIGHT' } })
    ).id;
    const passwordHash = await argon2.hash(password);
    await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        email: 'operador@a.com',
        passwordHash,
        name: 'Operador A',
        role: 'OPERATOR',
        active: true,
        isAdmin: true,
      },
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ slug: tenant.slug, email: 'operador@a.com', password })
      .expect(201);
    cookie = sessionCookieFrom(login);
  });

  async function createOpenQuoteId(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/quotes/cost-based')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        partyId: party.id,
        icmsUf: 'SP',
        marginPercentage: '20',
        costLines: [{ costTypeId: freightTypeId, amount: '400' }],
      })
      .expect(201);
    return res.body.id;
  }

  function acceptBody(overrides: Record<string, unknown> = {}) {
    return {
      branchId: branch.id,
      senderId: party.id,
      recipientId: party.id,
      tomadorId: party.id,
      ...overrides,
    };
  }

  describe('GET /parties e GET /branches', () => {
    it('sem token, 401', async () => {
      await request(app.getHttpServer()).get('/parties').expect(401);
      await request(app.getHttpServer()).get('/branches').expect(401);
    });

    it('com token, devolvem o que existe pro tenant', async () => {
      const parties = await request(app.getHttpServer())
        .get('/parties')
        .set('Cookie', cookie)
        .expect(200);
      expect(parties.body).toEqual([
        { id: party.id, name: 'Cliente A', cnpj: '11444777000161', cpf: null },
      ]);

      const branches = await request(app.getHttpServer())
        .get('/branches')
        .set('Cookie', cookie)
        .expect(200);
      expect(branches.body).toEqual([{ id: branch.id, name: 'Matriz' }]);
    });
  });

  describe('GET /quotes/:id', () => {
    it('sem token, 401', async () => {
      await request(app.getHttpServer())
        .get(`/quotes/${await createOpenQuoteId()}`)
        .expect(401);
    });

    it('id que não existe, 404', async () => {
      await request(app.getHttpServer())
        .get(`/quotes/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(404);
    });

    it('rascunho: statusCode OPEN, sem total, isExpired false', async () => {
      const id = await createOpenQuoteId();
      const res = await request(app.getHttpServer())
        .get(`/quotes/${id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.statusCode).toBe('OPEN');
      expect(res.body.total).toBeNull();
      expect(res.body.isExpired).toBe(false);
      expect(res.body.costSubtotal).toBe('400');
      expect(res.body.order).toBeNull();
    });
  });

  describe('POST /quotes/:id/close', () => {
    it('sem decisão de validade, 400 com fieldErrors — omitir deixou de ser opção (unidade "configuração do tenant")', async () => {
      const id = await createOpenQuoteId();
      const res = await request(app.getHttpServer())
        .post(`/quotes/${id}/close`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({})
        .expect(400);

      expect(res.body.fieldErrors.validity).toBeDefined();
    });

    it('com prazo em dias, fecha e calcula validUntil — preço bate com a alíquota real semeada (SP 18%)', async () => {
      const id = await createOpenQuoteId();
      const res = await request(app.getHttpServer())
        .post(`/quotes/${id}/close`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ validity: { type: 'TERM', term: { unit: 'DAYS', amount: 3 } } })
        .expect(200);

      expect(res.body.statusCode).toBe('CLOSED');
      // 400 / (1 - 0.18) = 487.8048 (ICMS por dentro); depois a margem
      // de 20%, também por dentro: 487.8048 / (1 - 0.20) = 609.756,
      // arredondado a 609.76.
      expect(res.body.total).toBe('609.76');
      expect(res.body.validUntil).not.toBeNull();
      const expected = new Date();
      expected.setUTCDate(expected.getUTCDate() + 3);
      expect(String(res.body.validUntil).slice(0, 10)).toBe(
        expected.toISOString().slice(0, 10),
      );
    });
  });

  describe('POST /quotes/:id/accept', () => {
    it('corpo inválido (branchId ausente), 400 com fieldErrors', async () => {
      const id = await createOpenQuoteId();
      await request(app.getHttpServer())
        .post(`/quotes/${id}/close`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ validity: { type: 'TERM', term: { unit: 'DAYS', amount: 3 } } })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/quotes/${id}/accept`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send(acceptBody({ branchId: undefined }))
        .expect(400);
      expect(res.body.fieldErrors.branchId).toBeDefined();
    });

    it('cotação ainda não fechada (rascunho), 422 com o motivo', async () => {
      const id = await createOpenQuoteId();
      const res = await request(app.getHttpServer())
        .post(`/quotes/${id}/accept`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send(acceptBody())
        .expect(422);
      expect(res.body.message).toMatch(/preço fechado/);
    });

    it('cotação vencida, 422 dizendo "vencida"', async () => {
      // A rota exige prazo POSITIVO (a tela nunca deixaria digitar um
      // prazo negativo) — "vencida" só existe de verdade depois que o
      // tempo passa. Fecha com prazo real e move validUntil pro
      // passado direto no banco, simulando exatamente isso (owner, não
      // pelo service — equivalente ao que aconteceria dias depois).
      const id = await createOpenQuoteId();
      await request(app.getHttpServer())
        .post(`/quotes/${id}/close`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ validity: { type: 'TERM', term: { unit: 'DAYS', amount: 3 } } })
        .expect(200);
      await admin.quote.update({
        where: { id },
        data: { validUntil: new Date('2000-01-01') },
      });

      const res = await request(app.getHttpServer())
        .post(`/quotes/${id}/accept`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send(acceptBody())
        .expect(422);
      expect(res.body.message).toMatch(/vencida/);
    });

    it('cotação fechada e válida: aceita, cria Order + 1 Trip (quantity=1) na mesma transação', async () => {
      const id = await createOpenQuoteId();
      await request(app.getHttpServer())
        .post(`/quotes/${id}/close`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ validity: { type: 'TERM', term: { unit: 'DAYS', amount: 3 } } })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/quotes/${id}/accept`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send(acceptBody())
        .expect(200);

      expect(res.body.statusCode).toBe('ACCEPTED');
      expect(res.body.order.tripsCount).toBe(1);
      expect(res.body.order.unitPrice).toBe('609.76');
      expect(res.body.order.number).toBeGreaterThan(0);

      const trips = await admin.trip.findMany({ where: { orderId: res.body.order.id } });
      expect(trips).toHaveLength(1);
      expect(trips[0].price?.toString()).toBe('609.76');
      expect(trips[0].driverId).toBeNull();
      expect(trips[0].vehicleId).toBeNull();
    });

    it('duplo aceite: a segunda tentativa responde 409, "já foi aceita" — não cria um segundo Order', async () => {
      const id = await createOpenQuoteId();
      await request(app.getHttpServer())
        .post(`/quotes/${id}/close`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ validity: { type: 'TERM', term: { unit: 'DAYS', amount: 3 } } })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/quotes/${id}/accept`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send(acceptBody())
        .expect(200);

      const second = await request(app.getHttpServer())
        .post(`/quotes/${id}/accept`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send(acceptBody())
        .expect(409);
      expect(second.body.message).toMatch(/já foi aceita/);

      const orders = await admin.order.findMany({ where: { quoteId: id } });
      expect(orders).toHaveLength(1);
    });
  });

  describe('POST /quotes/:id/reject', () => {
    it('cotação fechada: recusa, statusCode REJECTED', async () => {
      const id = await createOpenQuoteId();
      await request(app.getHttpServer())
        .post(`/quotes/${id}/close`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ validity: { type: 'TERM', term: { unit: 'DAYS', amount: 3 } } })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/quotes/${id}/reject`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      expect(res.body.statusCode).toBe('REJECTED');
    });

    it('cotação vencida ainda pode ser recusada (só accept() tem a guarda de vencimento)', async () => {
      const id = await createOpenQuoteId();
      await request(app.getHttpServer())
        .post(`/quotes/${id}/close`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ validity: { type: 'TERM', term: { unit: 'DAYS', amount: 3 } } })
        .expect(200);
      await admin.quote.update({
        where: { id },
        data: { validUntil: new Date('2000-01-01') },
      });

      const res = await request(app.getHttpServer())
        .post(`/quotes/${id}/reject`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      expect(res.body.statusCode).toBe('REJECTED');
    });

    it('recusar duas vezes: a segunda responde 409', async () => {
      const id = await createOpenQuoteId();
      await request(app.getHttpServer())
        .post(`/quotes/${id}/close`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ validity: { type: 'TERM', term: { unit: 'DAYS', amount: 3 } } })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/quotes/${id}/reject`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      await request(app.getHttpServer())
        .post(`/quotes/${id}/reject`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .expect(409);
    });
  });
});
