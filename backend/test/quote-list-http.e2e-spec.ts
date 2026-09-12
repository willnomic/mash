import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { v7 as uuidv7 } from 'uuid';
import { AppModule } from '../src/app.module.js';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureQuoteCostTypesSeeded } from './helpers/seed-quote-cost-types.js';
import { ensureOrderStatusesSeeded } from './helpers/seed-order-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';

// Roda a aplicação Nest inteira (mesmo critério de
// quote-lifecycle-http.e2e-spec.ts) — prova o wiring ponta a ponta de
// GET /quotes (unidade "lista de cotações"): visão padrão, os cinco
// estados como filtro, busca por nome do cliente (pg_trgm), paginação
// no servidor, e RLS.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Trip", "Order", "QuoteCostLine", "Quote", "QuoteCostType", "QuoteStatus", "Party", "Branch", "Tenant" CASCADE`;

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

describe('GET /quotes · lista de cotações (unidade "lista de cotações")', () => {
  let app: INestApplication<App>;
  const password = 'senha-forte-123';
  let tenant: { id: string; slug: string };
  let branch: { id: string };
  let partyA: { id: string };
  let partyB: { id: string };
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
    partyA = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Águia Translog',
        cnpj: '11444777000161',
      },
    });
    partyB = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Movecta Transportes',
        cnpj: '11222333000181',
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
      },
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ slug: tenant.slug, email: 'operador@a.com', password })
      .expect(201);
    cookie = sessionCookieFrom(login);
  });

  async function createQuote(partyId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/quotes/cost-based')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        partyId,
        icmsUf: 'SP',
        marginPercentage: '20',
        costLines: [{ costTypeId: freightTypeId, amount: '400' }],
      })
      .expect(201);
    return res.body.id;
  }

  async function closeQuote(id: string, days = 3) {
    await request(app.getHttpServer())
      .post(`/quotes/${id}/close`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ validityTerm: { unit: 'DAYS', amount: days } })
      .expect(200);
  }

  async function acceptQuote(id: string) {
    await request(app.getHttpServer())
      .post(`/quotes/${id}/accept`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        branchId: branch.id,
        senderId: partyA.id,
        recipientId: partyA.id,
        tomadorId: partyA.id,
      })
      .expect(200);
  }

  async function rejectQuote(id: string) {
    await request(app.getHttpServer())
      .post(`/quotes/${id}/reject`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .expect(200);
  }

  // Simula o tempo passando (mesma técnica já usada em
  // quote-lifecycle-http.e2e-spec.ts): fechar com prazo negativo é
  // recusado pelo schema (operador nunca digitaria isso), então fecha
  // com prazo válido e move validUntil pro passado direto no banco,
  // como dono — não como mash_app, que não tem esse GRANT.
  async function expireQuote(id: string) {
    await admin.quote.update({
      where: { id },
      data: { validUntil: new Date('2000-01-01') },
    });
  }

  describe('sem token', () => {
    it('401', async () => {
      await request(app.getHttpServer()).get('/quotes').expect(401);
    });
  });

  describe('visão padrão (sem query string)', () => {
    it('mostra só Fechada e válida, ordenada por validUntil mais próximo primeiro', async () => {
      const draft = await createQuote(partyA.id);

      const closeSoon = await createQuote(partyA.id);
      await closeQuote(closeSoon, 10);

      const closeSooner = await createQuote(partyA.id);
      await closeQuote(closeSooner, 3);

      const expired = await createQuote(partyA.id);
      await closeQuote(expired, 3);
      await expireQuote(expired);

      const accepted = await createQuote(partyA.id);
      await closeQuote(accepted, 3);
      await acceptQuote(accepted);

      const rejected = await createQuote(partyA.id);
      await closeQuote(rejected, 3);
      await rejectQuote(rejected);

      const res = await request(app.getHttpServer())
        .get('/quotes')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.items.map((q: { id: string }) => q.id)).toEqual([
        closeSooner,
        closeSoon,
      ]);
      expect(res.body.total).toBe(2);
      // draft/expired/accepted/rejected confirmam que a visão padrão
      // exclui os outros quatro estados — não é a lista inteira.
      const ids = res.body.items.map((q: { id: string }) => q.id);
      expect(ids).not.toContain(draft);
      expect(ids).not.toContain(expired);
      expect(ids).not.toContain(accepted);
      expect(ids).not.toContain(rejected);
    });

    it('cada linha reaproveita a forma de GET /quotes/:id: statusCode, isExpired, validUntil, party, total, createdAt', async () => {
      const id = await createQuote(partyA.id);
      await closeQuote(id, 5);

      const res = await request(app.getHttpServer())
        .get('/quotes')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.items[0]).toEqual({
        id,
        createdAt: expect.any(String),
        statusCode: 'CLOSED',
        isExpired: false,
        validUntil: expect.any(String),
        party: { id: partyA.id, name: 'Águia Translog' },
        total: '609.76',
      });
    });
  });

  describe('filtro por estado', () => {
    it('OPEN devolve só rascunhos', async () => {
      const draft = await createQuote(partyA.id);
      const closed = await createQuote(partyA.id);
      await closeQuote(closed);

      const res = await request(app.getHttpServer())
        .get('/quotes?status=OPEN')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.items.map((q: { id: string }) => q.id)).toEqual([
        draft,
      ]);
    });

    it('CLOSED_EXPIRED devolve só fechada e vencida — nunca statusId próprio, é derivado', async () => {
      const valid = await createQuote(partyA.id);
      await closeQuote(valid);
      const expired = await createQuote(partyA.id);
      await closeQuote(expired);
      await expireQuote(expired);

      const res = await request(app.getHttpServer())
        .get('/quotes?status=CLOSED_EXPIRED')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.items.map((q: { id: string }) => q.id)).toEqual([
        expired,
      ]);
    });

    it('ACCEPTED e REJECTED devolvem cada um só o seu', async () => {
      const accepted = await createQuote(partyA.id);
      await closeQuote(accepted);
      await acceptQuote(accepted);
      const rejected = await createQuote(partyA.id);
      await closeQuote(rejected);
      await rejectQuote(rejected);

      const acceptedRes = await request(app.getHttpServer())
        .get('/quotes?status=ACCEPTED')
        .set('Cookie', cookie)
        .expect(200);
      expect(acceptedRes.body.items.map((q: { id: string }) => q.id)).toEqual(
        [accepted],
      );

      const rejectedRes = await request(app.getHttpServer())
        .get('/quotes?status=REJECTED')
        .set('Cookie', cookie)
        .expect(200);
      expect(rejectedRes.body.items.map((q: { id: string }) => q.id)).toEqual(
        [rejected],
      );
    });

    it('status inválido, 400 com fieldErrors', async () => {
      const res = await request(app.getHttpServer())
        .get('/quotes?status=CLOSED_LOST')
        .set('Cookie', cookie)
        .expect(400);
      expect(res.body.fieldErrors.status).toBeDefined();
    });
  });

  describe('filtro por cliente e busca por texto', () => {
    it('partyId filtra por cliente exato', async () => {
      const forA = await createQuote(partyA.id);
      await closeQuote(forA);
      const forB = await createQuote(partyB.id);
      await closeQuote(forB);

      const res = await request(app.getHttpServer())
        .get(`/quotes?partyId=${partyB.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.items.map((q: { id: string }) => q.id)).toEqual([
        forB,
      ]);
    });

    it('busca por pedaço do nome do cliente, sem distinguir maiúscula (pg_trgm, mesmo padrão da D-038)', async () => {
      const forA = await createQuote(partyA.id);
      await closeQuote(forA);
      const forB = await createQuote(partyB.id);
      await closeQuote(forB);

      const res = await request(app.getHttpServer())
        .get('/quotes?q=movecta')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.items.map((q: { id: string }) => q.id)).toEqual([
        forB,
      ]);
    });

    it('busca sem correspondência devolve lista vazia, não erro', async () => {
      const id = await createQuote(partyA.id);
      await closeQuote(id);

      const res = await request(app.getHttpServer())
        .get('/quotes?q=zzzznada')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('paginação no servidor', () => {
    it('pageSize limita itens por página; total reflete o total real, não o da página', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const id = await createQuote(partyA.id);
        await closeQuote(id, 10 + i);
        ids.push(id);
      }

      const page1 = await request(app.getHttpServer())
        .get('/quotes?pageSize=2&page=1')
        .set('Cookie', cookie)
        .expect(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.total).toBe(5);
      expect(page1.body.page).toBe(1);
      expect(page1.body.pageSize).toBe(2);

      const page3 = await request(app.getHttpServer())
        .get('/quotes?pageSize=2&page=3')
        .set('Cookie', cookie)
        .expect(200);
      // 5 itens, pageSize 2: página 3 tem só o último (índices 4-5).
      expect(page3.body.items).toHaveLength(1);

      // Nenhum id repete entre as três páginas.
      const page2 = await request(app.getHttpServer())
        .get('/quotes?pageSize=2&page=2')
        .set('Cookie', cookie)
        .expect(200);
      const allIds = [
        ...page1.body.items,
        ...page2.body.items,
        ...page3.body.items,
      ].map((q: { id: string }) => q.id);
      expect(new Set(allIds).size).toBe(5);
      expect(new Set(allIds)).toEqual(new Set(ids));
    });

    it('page/pageSize fora do intervalo, 400 com fieldErrors', async () => {
      const res = await request(app.getHttpServer())
        .get('/quotes?page=0')
        .set('Cookie', cookie)
        .expect(400);
      expect(res.body.fieldErrors.page).toBeDefined();
    });
  });

  describe('RLS (D-012)', () => {
    it('cotação de outro tenant nunca aparece na lista', async () => {
      const tenantB = await admin.tenant.create({
        data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
      });
      const partyOfB = await admin.party.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          personType: 'COMPANY',
          name: 'Cliente de B',
          cnpj: '11444777000161',
        },
      });
      const openStatus = await admin.quoteStatus.findFirstOrThrow({
        where: { code: 'OPEN' },
      });
      await admin.quote.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          partyId: partyOfB.id,
          statusId: openStatus.id,
          marginPercentage: '20',
          icmsUf: 'SP',
        },
      });

      const forA = await createQuote(partyA.id);

      const res = await request(app.getHttpServer())
        .get('/quotes?status=OPEN')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.items.map((q: { id: string }) => q.id)).toEqual([
        forA,
      ]);
      expect(
        await forTenant(tenantB.id).quote.count({
          where: { partyId: partyOfB.id },
        }),
      ).toBe(1);
    });
  });
});
