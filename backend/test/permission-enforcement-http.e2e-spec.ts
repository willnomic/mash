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
import { TenantsService } from '../src/tenant/tenants.service.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureQuoteCostTypesSeeded } from './helpers/seed-quote-cost-types.js';

// Roda a aplicação Nest inteira — prova o requisito central da unidade
// "papéis e permissões", item 4: "a guarda é no servidor, sempre.
// Esconder na tela é conveniência, não segurança." Um usuário SEM a
// permissão recebe 403 do BACKEND, batendo a rota diretamente (sem
// passar pela tela que esconderia o botão).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "QuoteCostLine", "Quote", "QuoteCostType", "QuoteStatus", "GroupPermission", "Group", "Party", "Branch", "Tenant" CASCADE`;

function sessionCookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'] as string[] | undefined;
  const sessionCookie = setCookie?.find((c) => c.startsWith('session='));
  if (!sessionCookie) {
    throw new Error('login não devolveu cookie de sessão');
  }
  return sessionCookie.split(';')[0];
}

describe('Permissão · o backend recusa (unidade "papéis e permissões")', () => {
  let app: INestApplication<App>;
  const password = 'senha-forte-123';
  let tenant: { id: string; slug: string };
  let freightTypeId: string;
  let partyId: string;

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

    // TenantsService.create() já semeia Operador/Gestor (unidade "papéis
    // e permissões") — mesmo caminho real que qualquer tenant novo usa,
    // não uma fixture paralela.
    const tenantsService = new TenantsService();
    const created = await tenantsService.create({
      name: 'Transportadora A',
      slug: 'transportadora-a',
    });
    tenant = { id: created.id, slug: created.slug };

    freightTypeId = (
      await admin.quoteCostType.findFirstOrThrow({ where: { code: 'FREIGHT' } })
    ).id;
    const party = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Cliente A',
        cnpj: '11444777000161',
      },
    });
    partyId = party.id;
  });

  async function createUser(input: {
    email: string;
    groupName?: 'Operador' | 'Gestor';
    isAdmin?: boolean;
  }): Promise<void> {
    const passwordHash = await argon2.hash(password);
    const group = input.groupName
      ? await admin.group.findFirstOrThrow({
          where: { tenantId: tenant.id, name: input.groupName },
        })
      : null;
    await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        email: input.email,
        passwordHash,
        name: input.email,
        role: 'OPERATOR',
        active: true,
        groupId: group?.id,
        isAdmin: input.isAdmin ?? false,
      },
    });
  }

  async function loginAs(email: string): Promise<string> {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ slug: tenant.slug, email, password })
      .expect(201);
    return sessionCookieFrom(login);
  }

  it('usuário sem grupo e sem isAdmin: 403 tentando criar cotação — recusa é do BACKEND, não da tela', async () => {
    await createUser({ email: 'sem-permissao@a.com' });
    const cookie = await loginAs('sem-permissao@a.com');

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
      .expect(403);

    expect(res.body.message).toBeDefined();
  });

  it('usuário sem grupo: 403 também em GET (ver cadastro), não só em escrita', async () => {
    await createUser({ email: 'sem-permissao@a.com' });
    const cookie = await loginAs('sem-permissao@a.com');

    await request(app.getHttpServer())
      .get('/parties')
      .set('Cookie', cookie)
      .expect(403);

    await request(app.getHttpServer())
      .get('/branches')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('operador: cria cotação e vê cadastro — o fluxo comercial inteiro', async () => {
    await createUser({ email: 'operador@a.com', groupName: 'Operador' });
    const cookie = await loginAs('operador@a.com');

    await request(app.getHttpServer())
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

    await request(app.getHttpServer())
      .get('/parties')
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get('/branches')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('gestor: também cria cotação e vê cadastro (tudo do operador)', async () => {
    await createUser({ email: 'gestor@a.com', groupName: 'Gestor' });
    const cookie = await loginAs('gestor@a.com');

    await request(app.getHttpServer())
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
  });

  // Unidade "configuração do tenant": settings.view/settings.change são
  // as permissões que a D-055 semeou de propósito pra esta tela — a
  // guarda é no backend (GET/POST /tenant-settings), não só a rota
  // escondida na casca.
  it('operador: 403 em GET e POST /tenant-settings — não tem settings.view nem settings.change', async () => {
    await createUser({ email: 'operador@a.com', groupName: 'Operador' });
    const cookie = await loginAs('operador@a.com');

    await request(app.getHttpServer())
      .get('/tenant-settings')
      .set('Cookie', cookie)
      .expect(403);

    await request(app.getHttpServer())
      .post('/tenant-settings')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ defaultQuoteValidity: { type: 'NEVER' } })
      .expect(403);
  });

  it('gestor: configura o prazo padrão via POST /tenant-settings e lê de volta em GET', async () => {
    await createUser({ email: 'gestor@a.com', groupName: 'Gestor' });
    const cookie = await loginAs('gestor@a.com');

    await request(app.getHttpServer())
      .post('/tenant-settings')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        defaultQuoteValidity: { type: 'TERM', term: { unit: 'DAYS', amount: 15 } },
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/tenant-settings')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.defaultQuoteValidity).toEqual({
      type: 'TERM',
      term: { unit: 'DAYS', amount: 15 },
    });
  });

  it('isAdmin ignora grupo e tem tudo, mesmo sem grupo nenhum atribuído', async () => {
    await createUser({ email: 'admin@a.com', isAdmin: true });
    const cookie = await loginAs('admin@a.com');

    await request(app.getHttpServer())
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
  });

  it('GET /me devolve as permissões efetivas — a casca esconde com isso (item 5)', async () => {
    await createUser({ email: 'operador@a.com', groupName: 'Operador' });
    const cookie = await loginAs('operador@a.com');

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.isAdmin).toBe(false);
    expect(res.body.permissions.sort()).toEqual([
      'quote.accept',
      'quote.close',
      'quote.create',
      'quote.reject',
      'quote.view',
      'registration.create',
      'registration.view',
    ]);
    expect(res.body.permissions).not.toContain('settings.view');
  });

  it('GET /me de um gestor inclui as permissões de configuração', async () => {
    await createUser({ email: 'gestor@a.com', groupName: 'Gestor' });
    const cookie = await loginAs('gestor@a.com');

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.permissions).toContain('settings.view');
    expect(res.body.permissions).toContain('settings.change');
  });

  it('sem token, 401 antes mesmo de chegar na checagem de permissão', async () => {
    // Origin setado pra passar da checagem de CSRF do TenantGuard (D-048)
    // e provar especificamente a checagem de SESSÃO — sem isso o 403 de
    // Origem ausente aconteceria primeiro, testando a coisa errada.
    await request(app.getHttpServer())
      .post('/quotes/cost-based')
      .set('Origin', 'http://localhost:5173')
      .expect(401);
  });
});
