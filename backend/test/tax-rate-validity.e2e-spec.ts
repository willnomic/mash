import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { base } from '../src/prisma/prisma-tenant.js';
import { TaxRateService } from '../src/tax-rate/tax-rate.service.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia provada
// aqui (D-041/D-014: sobreposição de vigência bloqueada, lookup por data
// usa a alíquota daquela data) é do banco (EXCLUDE) e do serviço juntos.
//
// TaxRate não é isolada por tenant e não é limpa por TRUNCATE de
// nenhuma outra tabela (sem FK pra Tenant) — as linhas extras que este
// arquivo insere (via admin, mash_owner: mash_app não tem INSERT aqui,
// D-041) são removidas explicitamente no fim, por id, pra não poluir a
// tabela global entre execuções.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const EXTRA_IDS = [
  '00000000-0000-7000-8000-0000000000f1',
  '00000000-0000-7000-8000-0000000000f2',
  '00000000-0000-7000-8000-0000000000f3',
  '00000000-0000-7000-8000-0000000000f4',
  '00000000-0000-7000-8000-0000000000f5',
];

// UF sintética (não é estado real) — evita interferir com a semente das
// 27 UFs reais enquanto ainda exercita a mesma constraint.
const TEST_UF = 'ZZ';

describe('TaxRate · vigência (D-041/D-014)', () => {
  afterEach(async () => {
    await admin.taxRate.deleteMany({ where: { id: { in: EXTRA_IDS } } });
  });

  afterAll(async () => {
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('recusa sobreposição de vigência — mesmo tributo, mesma UF', async () => {
    await admin.taxRate.create({
      data: {
        id: EXTRA_IDS[0],
        taxType: 'ICMS',
        uf: TEST_UF,
        rate: '17',
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-06-01'),
      },
    });

    await expect(
      admin.taxRate.create({
        data: {
          id: EXTRA_IDS[1],
          taxType: 'ICMS',
          uf: TEST_UF,
          // Começa antes do primeiro terminar — sobrepõe.
          rate: '19',
          validFrom: new Date('2026-05-01'),
          validTo: new Date('9999-12-31'),
        },
      }),
    ).rejects.toThrow();
  });

  it('aceita vigências sequenciais (não sobrepostas) para o mesmo tributo/UF', async () => {
    await admin.taxRate.create({
      data: {
        id: EXTRA_IDS[0],
        taxType: 'ICMS',
        uf: TEST_UF,
        rate: '17',
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-06-01'),
      },
    });

    await expect(
      admin.taxRate.create({
        data: {
          id: EXTRA_IDS[1],
          taxType: 'ICMS',
          uf: TEST_UF,
          rate: '19',
          // Começa exatamente onde a anterior termina — '[)' não sobrepõe.
          validFrom: new Date('2026-06-01'),
          validTo: new Date('9999-12-31'),
        },
      }),
    ).resolves.toBeTruthy();
  });

  it('recusa sobreposição entre duas linhas nacionais (uf nulo) do mesmo tributo — prova o coalesce', async () => {
    // Sem o coalesce(uf, '') no EXCLUDE, duas linhas com uf NULO nunca
    // colidiriam entre si (EXCLUDE trata cada NULL como distinto de
    // outro NULL, mesma armadilha do UNIQUE) — isso provaria a correção
    // do índice, não só a intenção documentada no comentário.
    await admin.taxRate.create({
      data: {
        id: EXTRA_IDS[2],
        taxType: 'IBS',
        uf: null,
        rate: '0.1',
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2026-01-01'),
      },
    });

    await expect(
      admin.taxRate.create({
        data: {
          id: EXTRA_IDS[3],
          taxType: 'IBS',
          uf: null,
          rate: '0.2',
          // Sobrepõe a linha acima (2025-06-01 está dentro de
          // 2025-01-01..2026-01-01).
          validFrom: new Date('2025-06-01'),
          validTo: new Date('2027-01-01'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa ICMS sem UF e IBS/CBS com UF — CHECK amarra taxType a uf', async () => {
    await expect(
      admin.taxRate.create({
        data: {
          id: EXTRA_IDS[4],
          taxType: 'ICMS',
          uf: null,
          rate: '18',
          validFrom: new Date('2030-01-01'),
          validTo: new Date('2031-01-01'),
        },
      }),
    ).rejects.toThrow();

    await expect(
      admin.taxRate.create({
        data: {
          id: EXTRA_IDS[4],
          taxType: 'IBS',
          uf: TEST_UF,
          rate: '0.1',
          validFrom: new Date('2030-01-01'),
          validTo: new Date('2031-01-01'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recotar uma data passada usa a alíquota daquela data, não a de hoje', async () => {
    // Alíquota antiga, já superada — vigeu só em 2020.
    await admin.taxRate.create({
      data: {
        id: EXTRA_IDS[0],
        taxType: 'ICMS',
        uf: TEST_UF,
        rate: '12',
        validFrom: new Date('2020-01-01'),
        validTo: new Date('2021-01-01'),
      },
    });
    // Alíquota atual.
    await admin.taxRate.create({
      data: {
        id: EXTRA_IDS[1],
        taxType: 'ICMS',
        uf: TEST_UF,
        rate: '18',
        validFrom: new Date('2021-01-01'),
        validTo: new Date('9999-12-31'),
      },
    });

    const service = new TaxRateService();

    const historical = await service.findRate(base, {
      taxType: 'ICMS',
      uf: TEST_UF,
      date: new Date('2020-06-15'),
    });
    const current = await service.findRate(base, {
      taxType: 'ICMS',
      uf: TEST_UF,
      date: new Date('2026-06-15'),
    });

    expect(historical.rate.toString()).toBe('12');
    expect(current.rate.toString()).toBe('18');
  });
});
