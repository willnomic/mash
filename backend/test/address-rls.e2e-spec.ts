import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Address carrega tenantId e RLS próprios (não herda do Customer
// via join) — este arquivo prova que isso realmente segura.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Address · Row-Level Security (D-012)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };
  let customerA: { id: string };
  let customerB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Customer", "Tenant" CASCADE`;
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    customerA = await admin.customer.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        personType: 'INDIVIDUAL',
        name: 'Cliente A',
        cpf: '52998224725',
      },
    });
    customerB = await admin.customer.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        personType: 'COMPANY',
        name: 'Cliente B',
        cnpj: '11444777000161',
      },
    });
    await admin.address.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        customerId: customerA.id,
        logradouro: 'Rua A',
        bairro: 'Centro',
        municipio: 'São Paulo',
        uf: 'SP',
        cep: '01310100',
      },
    });
    await admin.address.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        customerId: customerB.id,
        logradouro: 'Rua B',
        bairro: 'Centro',
        municipio: 'Curitiba',
        uf: 'PR',
        cep: '80010000',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Customer", "Tenant" CASCADE`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const addresses = await forTenant(tenantA.id).address.findMany();

    expect(addresses).toHaveLength(1);
    expect(addresses[0].tenantId).toBe(tenantA.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const addresses = await base.address.findMany();

    expect(addresses).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(tenantA.id).$queryRaw`SELECT * FROM "Address"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(tenantA.id).address.create({
        data: {
          id: uuidv7(),
          tenantId: tenantB.id,
          customerId: customerB.id,
          logradouro: 'Rua Forjada',
          bairro: 'Centro',
          municipio: 'Curitiba',
          uf: 'PR',
          cep: '80010000',
        },
      }),
    ).rejects.toThrow();
  });
});
