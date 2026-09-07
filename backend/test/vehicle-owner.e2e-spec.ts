import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

// Roda contra o PostgreSQL real do docker-compose. Prova a decisão da
// seção 3 do D-023 (implementada nesta sessão): ownerPartyId nulo é frota
// própria, preenchido é de terceiro com proprietário nominal identificável
// — sem o enum VehicleOwnership, que virou fonte de verdade redundante.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Vehicle · proprietário (D-023)', () => {
  let tenant: { id: string };
  let owner: { id: string; name: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Vehicle", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    owner = await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        personType: 'INDIVIDUAL',
        name: 'Proprietário Terceiro',
        cpf: '11144477735',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Vehicle", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('veículo próprio nasce sem ownerPartyId — frota do tenant', async () => {
    const owned = await forTenant(tenant.id).vehicle.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        plate: 'OWN1D01',
        renavam: '10000000001',
        type: 'CAVALO_MECANICO',
        capacityKg: '25000',
        tareKg: '8000',
      },
    });

    expect(owned.ownerPartyId).toBeNull();
  });

  it('veículo de terceiro carrega o proprietário identificável — não texto livre, uma Party real', async () => {
    const thirdPartyVehicle = await forTenant(tenant.id).vehicle.create({
      data: {
        id: uuidv7(),
        tenantId: tenant.id,
        plate: 'THI1D01',
        renavam: '10000000002',
        type: 'CARRETA',
        ownerPartyId: owner.id,
        capacityKg: '30000',
        tareKg: '7000',
      },
    });

    const withOwner = await forTenant(tenant.id).vehicle.findUniqueOrThrow({
      where: { id: thirdPartyVehicle.id },
      include: { ownerParty: true },
    });

    expect(withOwner.ownerParty?.id).toBe(owner.id);
    expect(withOwner.ownerParty?.name).toBe('Proprietário Terceiro');
    expect(withOwner.ownerParty?.cpf).toBe('11144477735');
  });

  it('recusa ownerPartyId apontando pra Party inexistente', async () => {
    await expect(
      forTenant(tenant.id).vehicle.create({
        data: {
          id: uuidv7(),
          tenantId: tenant.id,
          plate: 'INV1D01',
          renavam: '10000000003',
          type: 'CARRETA',
          ownerPartyId: uuidv7(),
          capacityKg: '30000',
          tareKg: '7000',
        },
      }),
    ).rejects.toThrow();
  });
});
