import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureOrderStatusesSeeded } from './helpers/seed-order-statuses.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia provada
// aqui (D-038: busca por customerReference funciona por PEDAÇO do
// número, não só prefixo/igualdade) depende do índice GIN trigram
// (pg_trgm) existir de verdade no banco, não dá pra mockar.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Order · busca por customerReference (D-038)', () => {
  let tenant: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "FreightRate", "Lane", "Party", "Branch", "Tenant" CASCADE`;
    await ensureOrderStatusesSeeded(admin);

    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    const branch = await admin.branch.create({
      data: { id: uuidv7(), tenantId: tenant.id, name: 'Matriz' },
    });
    const party = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Cliente A',
        cnpj: '11444777000161',
      },
    });
    const lane = await admin.lane.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        originCity: 'São Paulo',
        originState: 'SP',
        destinationCity: 'Curitiba',
        destinationState: 'PR',
      },
    });
    const freightRate = await admin.freightRate.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        partyId: party.id,
        laneId: lane.id,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('9999-12-31'),
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
      },
    });
    const status = await admin.orderStatus.findFirstOrThrow({
      where: { code: 'IN_PROGRESS' },
    });

    // Três referências reais da planilha do sócio — formatos livres, sem
    // prefixo comum, número no meio da string.
    const references = ['PRA 7497/24', '001-OP-I-6403', '32584/25-IMA'];
    for (const [i, customerReference] of references.entries()) {
      await admin.order.create({
        data: {
          id: uuidv7(),
          tenantId: tenant.id,
          branchId: branch.id,
          number: i + 1,
          statusId: status.id,
          customerReference,
          freightRateId: freightRate.id,
          senderId: party.id,
          recipientId: party.id,
          tomadorId: party.id,
          rate: '150.5',
          minimumFreight: '500',
          additionalPercentage: '2.5',
          total: '500',
        },
      });
    }
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Order", "FreightRate", "Lane", "Party", "Branch", "Tenant" CASCADE`;
    await ensureOrderStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('acha pelo pedaço do meio do número, não só pelo prefixo', async () => {
    // "6403" não é prefixo de "001-OP-I-6403" — só um índice de
    // substring de verdade (GIN trigram) acha isso com ILIKE '%...%'.
    const found = await forTenant(tenant.id).order.findMany({
      where: { customerReference: { contains: '6403', mode: 'insensitive' } },
    });

    expect(found).toHaveLength(1);
    expect(found[0].customerReference).toBe('001-OP-I-6403');
  });

  it('busca case-insensitive', async () => {
    const found = await forTenant(tenant.id).order.findMany({
      where: { customerReference: { contains: 'ima', mode: 'insensitive' } },
    });

    expect(found).toHaveLength(1);
    expect(found[0].customerReference).toBe('32584/25-IMA');
  });

  it('não acha fragmento que não existe em nenhuma referência', async () => {
    const found = await forTenant(tenant.id).order.findMany({
      where: { customerReference: { contains: 'ZZZZ', mode: 'insensitive' } },
    });

    expect(found).toHaveLength(0);
  });

  it('customerReference é opcional — pedido sem referência do cliente continua válido', async () => {
    const status = await admin.orderStatus.findFirstOrThrow({
      where: { code: 'IN_PROGRESS' },
    });
    const freightRate = await admin.freightRate.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    const party = await admin.party.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    const branch = await admin.branch.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });

    const order = await forTenant(tenant.id).order.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        branchId: branch.id,
        number: 4,
        statusId: status.id,
        freightRateId: freightRate.id,
        senderId: party.id,
        recipientId: party.id,
        tomadorId: party.id,
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
        total: '500',
      },
    });

    expect(order.customerReference).toBeNull();
  });
});
