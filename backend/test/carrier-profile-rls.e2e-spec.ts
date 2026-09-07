import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS e a
// unicidade 1:1 são do banco). Conecta como dono só para semear —
// mash_app não teria como criar dado fora do próprio tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedTenantWithParty(name: string, slug: string) {
  const tenant = await admin.tenant.create({
    data: { id: uuidv7(), name, slug },
  });
  const party = await admin.party.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      personType: 'INDIVIDUAL',
      name: `Terceiro ${name}`,
      cpf: '11144477735',
    },
  });
  return { tenant, party };
}

describe('CarrierProfile · Row-Level Security e existência opcional (D-019/D-023/D-032)', () => {
  let a: Awaited<ReturnType<typeof seedTenantWithParty>>;
  let b: Awaited<ReturnType<typeof seedTenantWithParty>>;

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "CarrierProfile", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    a = await seedTenantWithParty('A', 'transportadora-a');
    b = await seedTenantWithParty('B', 'transportadora-b');
    await admin.carrierProfile.create({
      data: {
        id: uuidv7(),
        tenantId: a.tenant.id,
        partyId: a.party.id,
        rntrc: '12345678',
        anttCategory: 'TAC',
        bondType: 'AGREGADO',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "CarrierProfile", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('não enxerga dado de outro tenant', async () => {
    const profiles = await forTenant(a.tenant.id).carrierProfile.findMany();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].tenantId).toBe(a.tenant.id);
  });

  it('sem tenant definido, não retorna nada', async () => {
    const profiles = await base.carrierProfile.findMany();

    expect(profiles).toHaveLength(0);
  });

  it('protege também consulta crua', async () => {
    const rows =
      await forTenant(a.tenant.id).$queryRaw`SELECT * FROM "CarrierProfile"`;

    expect(rows).toHaveLength(1);
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).carrierProfile.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          partyId: b.party.id,
          rntrc: '87654321',
          anttCategory: 'ETC',
          bondType: 'SPOT',
        },
      }),
    ).rejects.toThrow();
  });

  it('uma Party sem CarrierProfile não é contratável como TAC/ETC/CTC — perfil é o que registra isso', async () => {
    // b.party não tem CarrierProfile nenhum: existência opcional (D-032).
    // Nada aqui bloqueia usar b.party como thirdParty de um CarrierHire —
    // a obrigatoriedade do perfil, se um dia existir, é regra de
    // aplicação (D-030), não constraint de banco.
    const profile = await forTenant(b.tenant.id).carrierProfile.findUnique({
      where: { partyId: b.party.id },
    });

    expect(profile).toBeNull();
  });

  it('recusa um segundo CarrierProfile para a mesma Party — 1:1, não 1:N', async () => {
    await expect(
      forTenant(a.tenant.id).carrierProfile.create({
        data: {
          id: uuidv7(),
          tenantId: a.tenant.id,
          partyId: a.party.id,
          rntrc: '99999999',
          anttCategory: 'CTC',
          bondType: 'SPOT',
        },
      }),
    ).rejects.toThrow();
  });
});
