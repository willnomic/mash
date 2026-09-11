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

// Roda a aplicação Nest inteira — prova o wiring ponta a ponta da
// unidade "criar cliente sem sair do fluxo": POST /parties (com e sem
// endereço, CNPJ inválido, CNPJ duplicado), GET /parties/cnpj/:cnpj
// (validação de formato — o caminho de sucesso contra a BrasilAPI real
// é verificado à parte, unitário com fetch mockado +
// verificação manual no navegador), POST /branches.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Address", "Party", "Branch", "Tenant" CASCADE`;
const VALID_CNPJ = '11444777000161';
const OTHER_VALID_CNPJ = '11222333000181';

function sessionCookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'] as string[] | undefined;
  const sessionCookie = setCookie?.find((c) => c.startsWith('session='));
  if (!sessionCookie) {
    throw new Error('login não devolveu cookie de sessão');
  }
  return sessionCookie.split(';')[0];
}

describe('Criar cliente sem sair do fluxo · rotas HTTP (Party/Branch)', () => {
  let app: INestApplication<App>;
  const password = 'senha-forte-123';
  let tenant: { id: string; slug: string };
  let cookie: string;

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
    await admin.$disconnect();
    await base.$disconnect();
  });

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);

    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
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

  describe('POST /parties', () => {
    it('sem token, 401', async () => {
      await request(app.getHttpServer())
        .post('/parties')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Cliente Teste', cnpj: VALID_CNPJ })
        .expect(401);
    });

    it('CNPJ com dígito verificador errado, 400 com fieldErrors', async () => {
      const res = await request(app.getHttpServer())
        .post('/parties')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Cliente Teste', cnpj: '11444777000162' })
        .expect(400);
      expect(res.body.fieldErrors.cnpj).toBeDefined();
    });

    it('nome vazio, 400 com fieldErrors', async () => {
      const res = await request(app.getHttpServer())
        .post('/parties')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ name: '', cnpj: VALID_CNPJ })
        .expect(400);
      expect(res.body.fieldErrors.name).toBeDefined();
    });

    it('nome + CNPJ (com pontuação), sem endereço: cria só a Party, personType COMPANY', async () => {
      const res = await request(app.getHttpServer())
        .post('/parties')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Cliente Teste', cnpj: '11.444.777/0001-61' })
        .expect(201);

      expect(res.body.name).toBe('Cliente Teste');
      expect(res.body.cnpj).toBe(VALID_CNPJ);

      const party = await admin.party.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(party.personType).toBe('COMPANY');
      expect(party.cpf).toBeNull();

      const addresses = await admin.address.findMany({ where: { partyId: party.id } });
      expect(addresses).toHaveLength(0);
    });

    it('com endereço completo: cria Party e Address juntos, CEP normalizado', async () => {
      const res = await request(app.getHttpServer())
        .post('/parties')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Cliente Teste',
          cnpj: VALID_CNPJ,
          address: {
            logradouro: 'Rua A',
            bairro: 'Centro',
            municipio: 'São Paulo',
            uf: 'SP',
            cep: '01000-000',
          },
        })
        .expect(201);

      const addresses = await admin.address.findMany({ where: { partyId: res.body.id } });
      expect(addresses).toHaveLength(1);
      expect(addresses[0].cep).toBe('01000000');
      expect(addresses[0].logradouro).toBe('Rua A');
    });

    it('endereço incompleto (faltando bairro): cria a Party mesmo assim, sem endereço — endereço NUNCA bloqueia', async () => {
      const res = await request(app.getHttpServer())
        .post('/parties')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Cliente Teste',
          cnpj: VALID_CNPJ,
          address: {
            logradouro: 'Rua A',
            municipio: 'São Paulo',
            uf: 'SP',
            cep: '01000000',
          },
        })
        .expect(201);

      const addresses = await admin.address.findMany({ where: { partyId: res.body.id } });
      expect(addresses).toHaveLength(0);
    });

    it('CNPJ já cadastrado no tenant: 409 com o motivo e a parte existente pra reaproveitar', async () => {
      await request(app.getHttpServer())
        .post('/parties')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Cliente Original', cnpj: VALID_CNPJ })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/parties')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Nome Diferente', cnpj: VALID_CNPJ })
        .expect(409);

      expect(res.body.message).toMatch(/já cadastrado/);
      expect(res.body.existingParty.name).toBe('Cliente Original');

      const count = await admin.party.count({ where: { cnpj: VALID_CNPJ } });
      expect(count).toBe(1);
    });

    it('mesmo CNPJ em tenants diferentes não colide (unique é por tenant)', async () => {
      const tenantB = await admin.tenant.create({
        data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
      });
      const passwordHash = await argon2.hash(password);
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
      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ slug: tenantB.slug, email: 'operador@b.com', password })
        .expect(201);
      const cookieB = sessionCookieFrom(loginB);

      await request(app.getHttpServer())
        .post('/parties')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Cliente A', cnpj: OTHER_VALID_CNPJ })
        .expect(201);

      await request(app.getHttpServer())
        .post('/parties')
        .set('Cookie', cookieB)
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Cliente B', cnpj: OTHER_VALID_CNPJ })
        .expect(201);
    });
  });

  describe('GET /parties/cnpj/:cnpj', () => {
    it('sem token, 401', async () => {
      await request(app.getHttpServer())
        .get(`/parties/cnpj/${VALID_CNPJ}`)
        .expect(401);
    });

    it('formato inválido (dígito verificador errado), 400 com fieldErrors — nunca chega a consultar a API externa', async () => {
      const res = await request(app.getHttpServer())
        .get('/parties/cnpj/11444777000162')
        .set('Cookie', cookie)
        .expect(400);
      expect(res.body.fieldErrors.cnpj).toBeDefined();
    });
  });

  describe('POST /branches', () => {
    it('sem token, 401', async () => {
      await request(app.getHttpServer())
        .post('/branches')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Filial Norte' })
        .expect(401);
    });

    it('nome vazio, 400 com fieldErrors', async () => {
      const res = await request(app.getHttpServer())
        .post('/branches')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ name: '' })
        .expect(400);
      expect(res.body.fieldErrors.name).toBeDefined();
    });

    it('nome preenchido: cria a filial', async () => {
      const res = await request(app.getHttpServer())
        .post('/branches')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Filial Norte' })
        .expect(201);
      expect(res.body.name).toBe('Filial Norte');

      const branch = await admin.branch.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(branch.tenantId).toBe(tenant.id);
    });
  });
});
