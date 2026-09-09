import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { base } from '../src/prisma/prisma-tenant.js';
import {
  ICMS_INTRAMUNICIPAL_RATE,
  TaxRateService,
} from '../src/tax-rate/tax-rate.service.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia provada
// aqui (D-041/D-014: sobreposição de vigência bloqueada, lookup por data
// usa a alíquota daquela data; D-043: os três casos de ICMS) é do banco
// (EXCLUDE/CHECK) e do serviço juntos.
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
  '00000000-0000-7000-8000-0000000000f6',
  '00000000-0000-7000-8000-0000000000f7',
];

// UF sintética (não é estado real) — evita interferir com a semente das
// 27 UFs reais enquanto ainda exercita a mesma constraint.
const TEST_UF = 'ZZ';

describe('TaxRate · vigência e os três casos de ICMS (D-041/D-014/D-043)', () => {
  afterEach(async () => {
    await admin.taxRate.deleteMany({ where: { id: { in: EXTRA_IDS } } });
  });

  afterAll(async () => {
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('recusa sobreposição de vigência — mesmo tributo, mesma UF (caso INTERNA)', async () => {
    await admin.taxRate.create({
      data: {
        id: EXTRA_IDS[0],
        taxType: 'ICMS',
        icmsOperationType: 'INTERNA',
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
          icmsOperationType: 'INTERNA',
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
        icmsOperationType: 'INTERNA',
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
          icmsOperationType: 'INTERNA',
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

  it('D-043 — recusa ICMS sem icmsOperationType (obrigatório pra ICMS, nulo só pra IBS/CBS)', async () => {
    await expect(
      admin.taxRate.create({
        data: {
          id: EXTRA_IDS[4],
          taxType: 'ICMS',
          icmsOperationType: null,
          uf: TEST_UF,
          rate: '18',
          validFrom: new Date('2030-01-01'),
          validTo: new Date('2031-01-01'),
        },
      }),
    ).rejects.toThrow();
  });

  it('D-043 — recusa ICMS interna sem uf, e ICMS interestadual COM uf (as duas amarras trocaram de lado)', async () => {
    await expect(
      admin.taxRate.create({
        data: {
          id: EXTRA_IDS[4],
          taxType: 'ICMS',
          icmsOperationType: 'INTERNA',
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
          taxType: 'ICMS',
          icmsOperationType: 'INTERESTADUAL_7',
          uf: TEST_UF,
          rate: '7',
          validFrom: new Date('2030-01-01'),
          validTo: new Date('2031-01-01'),
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa IBS/CBS com uf preenchido — CHECK ainda amarra o caso nacional', async () => {
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

  it('D-043 — aceita as duas linhas de ICMS interestadual (7%/12%, ambas uf nulo) coexistindo, sem colidir no EXCLUDE', async () => {
    // Prova direta de que o CASE dentro do EXCLUDE (não o coalesce+cast,
    // que quebrava com "functions in index expression must be marked
    // IMMUTABLE" — achado real desta sessão) distingue as duas linhas
    // mesmo as duas tendo uf nulo e a mesma vigência.
    //
    // Vigência em 2015-2016, não 2030-2031: as duas linhas reais
    // semeadas na migração (INTERESTADUAL_7/12) valem 2026-01-01 até
    // 9999-12-31 (pra sempre) — qualquer vigência futura colide com
    // elas de propósito (mesmo tipo, mesma janela). Um teste que prove
    // "linhas de tipos DIFERENTES não colidem" precisa ficar fora dessa
    // janela pra não confundir com "recusou por ser o mesmo tipo".
    await expect(
      admin.taxRate.create({
        data: {
          id: EXTRA_IDS[5],
          taxType: 'ICMS',
          icmsOperationType: 'INTERESTADUAL_7',
          uf: null,
          rate: '7',
          validFrom: new Date('2015-01-01'),
          validTo: new Date('2016-01-01'),
        },
      }),
    ).resolves.toBeTruthy();

    await expect(
      admin.taxRate.create({
        data: {
          id: EXTRA_IDS[6],
          taxType: 'ICMS',
          icmsOperationType: 'INTERESTADUAL_12',
          uf: null,
          // Mesma vigência exata da linha acima — se o EXCLUDE não
          // distinguisse por icmsOperationType, isso colidiria.
          rate: '12',
          validFrom: new Date('2015-01-01'),
          validTo: new Date('2016-01-01'),
        },
      }),
    ).resolves.toBeTruthy();
  });

  it('recotar uma data passada usa a alíquota daquela data, não a de hoje', async () => {
    // Alíquota antiga, já superada — vigeu só em 2020.
    await admin.taxRate.create({
      data: {
        id: EXTRA_IDS[0],
        taxType: 'ICMS',
        icmsOperationType: 'INTERNA',
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
        icmsOperationType: 'INTERNA',
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

  it('D-043 — findRate() recusa ICMS sem uf, em vez de escolher arbitrariamente entre as duas linhas interestaduais', async () => {
    const service = new TaxRateService();

    await expect(
      service.findRate(base, {
        taxType: 'ICMS',
        uf: null,
        date: new Date('2026-06-15'),
      }),
    ).rejects.toThrow(/findInterstateIcmsRate/);
  });

  it('D-043 — findInterstateIcmsRate() resolve 7% só na direção Sul/Sudeste-exceto-ES → Norte/Nordeste/Centro-Oeste/ES, 12% em qualquer outra direção', async () => {
    const service = new TaxRateService();
    const date = new Date('2026-06-15');

    // SP (Sudeste) → BA (Nordeste): a combinação exata que dá 7%.
    const spParaBahia = await service.findInterstateIcmsRate(base, {
      originUf: 'SP',
      destinationUf: 'BA',
      date,
    });
    expect(spParaBahia.rate.toString()).toBe('7');

    // BA (Nordeste) → SP (Sudeste): direção invertida, cai em 12% — a
    // regra não é simétrica (mesma dupla de UFs, resultado diferente).
    const bahiaParaSp = await service.findInterstateIcmsRate(base, {
      originUf: 'BA',
      destinationUf: 'SP',
      date,
    });
    expect(bahiaParaSp.rate.toString()).toBe('12');

    // SP → RJ: os dois são Sul/Sudeste-exceto-ES, não é a combinação do
    // 7% (destino também precisa estar em Norte/Nordeste/CO/ES) — 12%.
    const spParaRj = await service.findInterstateIcmsRate(base, {
      originUf: 'SP',
      destinationUf: 'RJ',
      date,
    });
    expect(spParaRj.rate.toString()).toBe('12');

    // PR (Sul) → ES: ES entra no grupo de destino elegível pro 7%
    // mesmo sendo tecnicamente "Sudeste" — a consulta tributária é
    // explícita nisso ("...e o destino é Norte/Nordeste/Centro-Oeste/ES").
    const prParaEs = await service.findInterstateIcmsRate(base, {
      originUf: 'PR',
      destinationUf: 'ES',
      date,
    });
    expect(prParaEs.rate.toString()).toBe('7');
  });

  it('D-043 — ICMS intramunicipal é constante (sem ICMS), não linha de TaxRate', () => {
    // Não é lookup no banco: é fronteira de competência tributária
    // (ISS, não ICMS), fato estrutural sem vigência — mesmo município
    // de origem e destino nunca teve ICMS, essa constante não muda por
    // lei estadual como as outras.
    expect(ICMS_INTRAMUNICIPAL_RATE.toString()).toBe('0');
  });
});
