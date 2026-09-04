import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia que este
// arquivo prova (EXCLUDE, GRANT por coluna) é do banco, não da aplicação.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('FreightRate · vigência e imutabilidade (D-014)', () => {
  let tenant: { id: string };
  let customer: { id: string };
  let lane: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "FreightRate", "Lane", "Customer", "Tenant" CASCADE`;
    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    customer = await admin.customer.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Cliente A',
        cnpj: '11444777000161',
      },
    });
    lane = await admin.lane.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        originCity: 'São Paulo',
        originState: 'SP',
        destinationCity: 'Curitiba',
        destinationState: 'PR',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "FreightRate", "Lane", "Customer", "Tenant" CASCADE`;
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('o banco recusa vigências sobrepostas para o mesmo tenant+customer+lane', async () => {
    await forTenant(tenant.id).freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        customerId: customer.id,
        laneId: lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-07-01'),
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });

    await expect(
      forTenant(tenant.id).freightRate.create({
        data: {
          id: uuidv7(),
          tenantId: tenant.id,
          customerId: customer.id,
          laneId: lane.id,
          // Sobrepõe: começa antes do fim da linha anterior (2026-07-01).
          validFrom: new Date('2026-03-01'),
          validTo: new Date('2026-12-31'),
          rate: '160',
          minimumFreight: '500',
          additionalPercentage: '2.5',
        },
      }),
    ).rejects.toThrow();
  });

  it('permite vigência adjacente (fechar e abrir no mesmo dia, sem sobrepor)', async () => {
    await forTenant(tenant.id).freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        customerId: customer.id,
        laneId: lane.id,
        // daterange(..., '[)'): validTo é exclusivo — vale até 2026-06-30.
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-07-01'),
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });

    // Começa exatamente onde a anterior fechou — não é sobreposição.
    await expect(
      forTenant(tenant.id).freightRate.create({
        data: {
          id: uuidv7(),
          tenantId: tenant.id,
          customerId: customer.id,
          laneId: lane.id,
          validFrom: new Date('2026-07-01'),
          validTo: new Date('2026-12-31'),
          rate: '160',
          minimumFreight: '500',
          additionalPercentage: '2.5',
        },
      }),
    ).resolves.toBeTruthy();
  });

  it('consulta por data retorna a tarifa vigente naquela data, não a atual', async () => {
    await forTenant(tenant.id).freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        customerId: customer.id,
        laneId: lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-07-01'),
        rate: '100', // tarifa histórica, já fechada
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });
    await forTenant(tenant.id).freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        customerId: customer.id,
        laneId: lane.id,
        validFrom: new Date('2026-07-01'),
        validTo: new Date('9999-12-31'), // sentinela: vigente até fechar
        rate: '150', // tarifa atual
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });

    const referenceDate = new Date('2026-03-15'); // dentro da janela histórica
    const applicable = await forTenant(tenant.id).freightRate.findFirst({
      where: {
        tenantId: tenant.id,
        customerId: customer.id,
        laneId: lane.id,
        validFrom: { lte: referenceDate },
        validTo: { gt: referenceDate },
      },
    });

    expect(applicable?.rate.toString()).toBe('100');
  });

  it('impede alterar tarifa, valor ou identidade da linha — só validTo fecha', async () => {
    const rate = await forTenant(tenant.id).freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        customerId: customer.id,
        laneId: lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('9999-12-31'),
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });

    await expect(
      forTenant(tenant.id).freightRate.update({
        where: { id: rate.id },
        data: { rate: '999' },
      }),
    ).rejects.toThrow();
  });

  it('permite fechar a vigência (alterar só validTo)', async () => {
    const rate = await forTenant(tenant.id).freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        customerId: customer.id,
        laneId: lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('9999-12-31'),
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });

    const closed = await forTenant(tenant.id).freightRate.update({
      where: { id: rate.id },
      data: { validTo: new Date('2026-07-01') },
    });

    expect(closed.validTo.toISOString().slice(0, 10)).toBe('2026-07-01');
  });
});
