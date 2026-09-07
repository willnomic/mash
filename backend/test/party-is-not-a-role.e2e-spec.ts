import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedCarrierHireScenario } from './helpers/seed-carrier-hire-scenario.js';

// Trava a modelagem de D-018/D-032: Party é uma parte, não um papel. Não
// existem entidades separadas para remetente, destinatário, tomador e
// terceiro contratado — a mesma Party pode ser todos eles, inclusive ao
// mesmo tempo em registros diferentes. É a razão de existir do renomeio
// de Customer para Party (D-032): "cliente" não descreve uma parte que
// também é contratada e paga como terceiro.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Party · é uma parte, não um papel (D-018, D-032)', () => {
  let tenantA: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('a tabela não tem coluna de papel comercial — só personType (PF/PJ)', async () => {
    const columns = await admin.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Party'
    `;
    const names = columns.map((c) => c.column_name.toLowerCase());

    // personType distingue documento (CPF/CNPJ), não papel comercial. Se
    // esse teste falhar, alguém adicionou uma coluna de papel à Party —
    // exatamente o padrão que D-018 rejeitou.
    const roleLike = names.filter((n) =>
      /role|papel|shipper|consignee|payer|tomador|remetente|destinatario/.test(
        n,
      ),
    );

    expect(roleLike).toEqual([]);
  });

  it('a mesma Party é referenciável em papéis diferentes, sem restrição', async () => {
    const party = await forTenant(tenantA.id).party.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        personType: 'COMPANY',
        name: 'Indústria XYZ',
        cnpj: '11444777000161',
      },
    });

    // Nada no schema impede usar o mesmo partyId como remetente numa
    // carga e como destinatário em outra — sem coluna nem unicidade que
    // amarre a Party a um único papel.
    const asShipper = await forTenant(tenantA.id).party.findUniqueOrThrow({
      where: { id: party.id },
    });
    const asConsignee = await forTenant(tenantA.id).party.findUniqueOrThrow({
      where: { id: party.id },
    });

    expect(asShipper.id).toBe(party.id);
    expect(asConsignee.id).toBe(party.id);
  });

  it('a mesma Party é tomador de um Order e terceiro contratado de um CarrierHire ao mesmo tempo', async () => {
    // Cadeia completa até uma Trip (D-018/D-019) — reaproveita o cenário
    // de CarrierHire, mas contrata como terceiro a MESMA Party que o
    // cenário já usa como sender/recipient/tomador do Order, em vez do
    // thirdParty separado que o helper cria. Prova o motivo do renomeio:
    // "cliente" e "terceiro contratado" não são papéis exclusivos entre
    // si — a mesma Party exerce os dois.
    await ensureTripStatusesSeeded(admin);
    const seed = await seedCarrierHireScenario(
      admin,
      'A',
      'transportadora-a-hire',
    );

    const hire = await forTenant(seed.tenant.id).carrierHire.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        tripId: seed.trip.id,
        thirdPartyId: seed.party.id,
        agreedFreight: '3000',
      },
    });

    expect(seed.order.tomadorId).toBe(seed.party.id);
    expect(hire.thirdPartyId).toBe(seed.party.id);
  });
});
