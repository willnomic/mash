import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

// Roda contra o PostgreSQL real do docker-compose. Prova a decisão da
// unidade "datas na viagem": partyId de Address virou anulável — mesmo
// mecanismo do ownerPartyId do Vehicle (D-023). Terminal/porto recorrente
// tem dono (Party); coleta esporádica não. Um Address só, o que muda é
// ter dono ou não — sem caminho separado pra terminal.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Address · dono anulável e horário de funcionamento (unidade "datas na viagem")', () => {
  let tenant: { id: string };
  let party: { id: string; name: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    party = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'COMPANY',
        name: 'Porto de Itajaí',
        cnpj: '11444777000161',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('endereço sem dono nasce com partyId nulo — coleta esporádica', async () => {
    const sporadic = await forTenant(tenant.id).address.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        logradouro: 'Rua do Cliente Avulso',
        bairro: 'Centro',
        municipio: 'Itajaí',
        uf: 'SC',
        cep: '88301000',
      },
    });

    expect(sporadic.partyId).toBeNull();
  });

  it('endereço com dono carrega a Party identificável — não texto livre', async () => {
    const owned = await forTenant(tenant.id).address.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        partyId: party.id,
        logradouro: 'Av. Portuária',
        bairro: 'Porto',
        municipio: 'Itajaí',
        uf: 'SC',
        cep: '88301000',
        businessHours: 'Seg a sex, 7h às 19h; sáb 7h às 12h',
      },
    });

    const withOwner = await forTenant(tenant.id).address.findUniqueOrThrow({
      where: { id: owned.id },
      include: { party: true },
    });

    expect(withOwner.party?.id).toBe(party.id);
    expect(withOwner.party?.name).toBe('Porto de Itajaí');
    expect(withOwner.businessHours).toBe('Seg a sex, 7h às 19h; sáb 7h às 12h');
  });

  it('recusa partyId apontando pra Party inexistente', async () => {
    await expect(
      forTenant(tenant.id).address.create({
        data: {
          id: uuidv7(),
          tenantId: tenant.id,
          partyId: uuidv7(),
          logradouro: 'Rua Inválida',
          bairro: 'Centro',
          municipio: 'Itajaí',
          uf: 'SC',
          cep: '88301000',
        },
      }),
    ).rejects.toThrow();
  });

  it('endereço sem dono aceita businessHours mesmo assim — não reforçado por CHECK', async () => {
    const sporadicWithHours = await forTenant(tenant.id).address.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        logradouro: 'Terminal Avulso',
        bairro: 'Centro',
        municipio: 'Itajaí',
        uf: 'SC',
        cep: '88301000',
        businessHours: '24h',
      },
    });

    expect(sporadicWithHours.businessHours).toBe('24h');
  });
});
