import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';

// TaxRate não tem tenantId (D-041): é valor de lei, não configuração de
// tenant. RLS continua ligado (guarda de schema, D-012), mas a política é
// `USING (true)` — este arquivo prova esse mecanismo, diferente do
// isolamento padrão já coberto nos outros *-rls.e2e-spec.ts.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('TaxRate · sem fronteira de tenant, só leitura pra mash_app (D-041)', () => {
  afterAll(async () => {
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('qualquer tenant enxerga as alíquotas semeadas (IBS/CBS/ICMS)', async () => {
    const tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: `tenant-tax-${uuidv7()}` },
    });

    const rates = await forTenant(tenant.id).taxRate.findMany({
      where: { taxType: { in: ['IBS', 'CBS'] } },
    });

    expect(rates.map((r) => r.taxType).sort()).toEqual(['CBS', 'IBS']);
  });

  it('sem tenant nenhum definido (base), ainda enxerga — não há fronteira de tenant aqui', async () => {
    const rates = await base.taxRate.findMany({ where: { taxType: 'IBS' } });

    expect(rates.length).toBeGreaterThan(0);
  });

  it('recusa INSERT de mash_app — mudar alíquota é migração, não escrita da aplicação', async () => {
    const tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: `tenant-tax-${uuidv7()}` },
    });

    await expect(
      forTenant(tenant.id).taxRate.create({
        data: {
          id: uuidv7(),
          taxType: 'ICMS',
          uf: 'ZZ',
          rate: '99',
          validFrom: new Date('2026-01-01'),
          validTo: new Date('9999-12-31'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa UPDATE de mash_app', async () => {
    const tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora C', slug: `tenant-tax-${uuidv7()}` },
    });
    const ibs = await forTenant(tenant.id).taxRate.findFirstOrThrow({
      where: { taxType: 'IBS' },
    });

    await expect(
      forTenant(tenant.id).taxRate.update({
        where: { id: ibs.id },
        data: { rate: '50' },
      }),
    ).rejects.toThrow();
  });

  it('recusa DELETE de mash_app', async () => {
    const tenant = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora D', slug: `tenant-tax-${uuidv7()}` },
    });
    const cbs = await forTenant(tenant.id).taxRate.findFirstOrThrow({
      where: { taxType: 'CBS' },
    });

    await expect(
      forTenant(tenant.id).taxRate.delete({ where: { id: cbs.id } }),
    ).rejects.toThrow();
  });
});
