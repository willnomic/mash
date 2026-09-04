import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

// Trava a modelagem de D-018 antes de Order existir: Customer é uma parte,
// não um papel. Não existem entidades separadas para remetente,
// destinatário e tomador — o mesmo Customer pode ser os três na mesma
// carga. Papel é relacionamento dentro do Order, nunca campo aqui.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Customer · é uma parte, não um papel (D-018)', () => {
  let tenantA: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Customer", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Address", "Customer", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('a tabela não tem coluna de papel comercial — só personType (PF/PJ)', async () => {
    const columns = await admin.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Customer'
    `;
    const names = columns.map((c) => c.column_name.toLowerCase());

    // personType distingue documento (CPF/CNPJ), não papel comercial. Se
    // esse teste falhar, alguém adicionou uma coluna de papel ao Customer
    // — exatamente o padrão que D-018 rejeitou.
    const roleLike = names.filter((n) =>
      /role|papel|shipper|consignee|payer|tomador|remetente|destinatario/.test(
        n,
      ),
    );

    expect(roleLike).toEqual([]);
  });

  it('o mesmo Customer é referenciável em papéis diferentes, sem restrição', async () => {
    const customer = await forTenant(tenantA.id).customer.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        personType: 'COMPANY',
        name: 'Indústria XYZ',
        cnpj: '11444777000161',
      },
    });

    // Nada no schema impede usar o mesmo customerId como remetente numa
    // carga e como destinatário em outra — sem coluna nem unicidade que
    // amarre o Customer a um único papel.
    const asShipper = await forTenant(tenantA.id).customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    const asConsignee = await forTenant(
      tenantA.id,
    ).customer.findUniqueOrThrow({ where: { id: customer.id } });

    expect(asShipper.id).toBe(customer.id);
    expect(asConsignee.id).toBe(customer.id);
  });
});
