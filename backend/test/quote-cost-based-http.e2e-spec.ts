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

// Roda a aplicação Nest inteira (mesmo critério de
// pickup-order-http.e2e-spec.ts) — prova o wiring ponta a ponta das TRÊS
// rotas novas da unidade "primeira tela de negócio, parte 1" (D-041/
// D-046/D-048): GET /quote-cost-types, GET /tax-rates/quote-preview,
// POST /quotes/cost-based. Não repete o que quote-cost-based.e2e-spec.ts
// já prova direto no service (cálculo, congelamento, imutabilidade) —
// aqui o alvo é a rota em si: guard, formato de erro, e que o rascunho
// nasce OPEN sem preço.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "QuoteCostLine", "Quote", "QuoteCostType", "QuoteStatus", "Tenant" CASCADE`;

function sessionCookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'] as string[] | undefined;
  const sessionCookie = setCookie?.find((c) => c.startsWith('session='));
  if (!sessionCookie) {
    throw new Error('login não devolveu cookie de sessão');
  }
  return sessionCookie.split(';')[0];
}

describe('Cotação por custo · rotas HTTP (unidade "primeira tela de negócio", parte 1)', () => {
  let app: INestApplication<App>;
  const password = 'senha-forte-123';
  let tenant: { id: string; slug: string };
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
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureQuoteCostTypesSeeded(admin);

    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
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
        // isAdmin (unidade "papéis e permissões") — este teste não é
        // sobre permissão, admin preserva o comportamento de antes.
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

  describe('GET /quote-cost-types', () => {
    it('sem token, 401', async () => {
      await request(app.getHttpServer()).get('/quote-cost-types').expect(401);
    });

    it('com token, devolve os tipos compartilhados (D-020) lidos do banco', async () => {
      const res = await request(app.getHttpServer())
        .get('/quote-cost-types')
        .set('Cookie', cookie)
        .expect(200);

      const codes = (res.body as { code: string }[]).map((t) => t.code).sort();
      expect(codes).toEqual(['FEES', 'FREIGHT', 'FUEL', 'INSURANCE', 'TOLL']);
    });
  });

  describe('GET /tax-rates/quote-preview', () => {
    it('sem token, 401', async () => {
      await request(app.getHttpServer())
        .get('/tax-rates/quote-preview')
        .query({ icmsUf: 'SP' })
        .expect(401);
    });

    it('UF inválida, 400 com fieldErrors', async () => {
      const res = await request(app.getHttpServer())
        .get('/tax-rates/quote-preview')
        .query({ icmsUf: 'XX' })
        .set('Cookie', cookie)
        .expect(400);

      expect(res.body.fieldErrors.icmsUf).toBeDefined();
    });

    it('UF válida, devolve as alíquotas REAIS semeadas na migração (mesmas de quote-cost-based.e2e-spec.ts)', async () => {
      const res = await request(app.getHttpServer())
        .get('/tax-rates/quote-preview')
        .query({ icmsUf: 'SP' })
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toEqual({
        icmsRatePercent: '18',
        ibsRatePercent: '0.1',
        ibsComposesPrice: false,
        cbsRatePercent: '0.9',
        cbsComposesPrice: false,
      });
    });
  });

  describe('POST /quotes/cost-based', () => {
    it('sem token, 401', async () => {
      await request(app.getHttpServer())
        .post('/quotes/cost-based')
        .set('Origin', 'http://localhost:5173')
        .send({
          icmsUf: 'SP',
          marginPercentage: '20',
          costLines: [{ costTypeId: freightTypeId, amount: '400' }],
        })
        .expect(401);
    });

    it('corpo inválido (margem >= 100), 400 com fieldErrors mapeado por campo', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotes/cost-based')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({
          partyId: party.id,
          icmsUf: 'SP',
          marginPercentage: '100',
          costLines: [{ costTypeId: freightTypeId, amount: '400' }],
        })
        .expect(400);

      expect(res.body.fieldErrors.marginPercentage).toBeDefined();
    });

    it('corpo válido: cria rascunho OPEN, guardando entrada — NUNCA preço', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotes/cost-based')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({
          partyId: party.id,
          icmsUf: 'SP',
          marginPercentage: '20',
          costLines: [
            { costTypeId: freightTypeId, amount: '400', description: 'Frete do terceiro' },
          ],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
      // A resposta não devolve preço nenhum — só o que foi persistido
      // (id/createdAt). Confere no banco que a Quote nasceu OPEN e sem
      // total/alíquotas (close(), fora de escopo, é quem preenche isso).
      const quote = await admin.quote.findUniqueOrThrow({
        where: { id: res.body.id },
        include: { status: true, costLines: true },
      });
      expect(quote.status.code).toBe('OPEN');
      expect(quote.total).toBeNull();
      expect(quote.icmsRateApplied).toBeNull();
      expect(quote.marginPercentage?.toString()).toBe('20');
      expect(quote.costLines).toHaveLength(1);
      expect(quote.costLines[0].amount.toString()).toBe('400');
    });

    it('cotação de um tenant é invisível pro outro (RLS, D-012)', async () => {
      const tenantB = await admin.tenant.create({
        data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
      });

      const created = await request(app.getHttpServer())
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

      // Existe de verdade (consulta sem RLS, direto pelo owner)...
      const viaOwner = await admin.quote.findUnique({
        where: { id: created.body.id },
      });
      expect(viaOwner).not.toBeNull();

      // ...mas some pro tenant B, mesmo consultando pelo id exato.
      const viaTenantB = await forTenant(tenantB.id).quote.findUnique({
        where: { id: created.body.id },
      });
      expect(viaTenantB).toBeNull();
    });
  });
});
