import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { base } from '../src/prisma/prisma-tenant.js';
import { TaxRateService } from '../src/tax-rate/tax-rate.service.js';

// Roda contra o PostgreSQL real do docker-compose — prova o mecanismo
// que torna o placeholder de ICMS (D-041) impossível de esquecer: não é
// comentário, é recusa em código, testada de verdade sob os valores
// reais de NODE_ENV que fariam a diferença em produção.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// process.env.NODE_ENV é 'test' sob vitest (verificado nesta sessão) —
// guardamos e restauramos em cada teste pra não vazar estado entre
// arquivos (a suíte roda sequencial, fileParallelism: false, mas o
// processo é compartilhado).
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe('TaxRateService · recusa alíquota placeholder fora de dev/test (D-041)', () => {
  const service = new TaxRateService();

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  afterAll(async () => {
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('recusa ICMS placeholder quando NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';

    await expect(
      service.findRate(base, { taxType: 'ICMS', uf: 'SP', date: new Date() }),
    ).rejects.toThrow(/placeholder/i);
  });

  it('recusa ICMS placeholder quando NODE_ENV está vazia/ausente — falha fechada', async () => {
    delete process.env.NODE_ENV;

    await expect(
      service.findRate(base, { taxType: 'ICMS', uf: 'RJ', date: new Date() }),
    ).rejects.toThrow(/placeholder/i);
  });

  it('aceita ICMS placeholder em NODE_ENV=development', async () => {
    process.env.NODE_ENV = 'development';

    await expect(
      service.findRate(base, { taxType: 'ICMS', uf: 'MG', date: new Date() }),
    ).resolves.toBeTruthy();
  });

  it('aceita ICMS placeholder em NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';

    await expect(
      service.findRate(base, { taxType: 'ICMS', uf: 'PR', date: new Date() }),
    ).resolves.toBeTruthy();
  });

  it('IBS/CBS não são placeholder (dado real, LC 214/2025) — passam mesmo em NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';

    const ibs = await service.findRate(base, { taxType: 'IBS', date: new Date() });
    const cbs = await service.findRate(base, { taxType: 'CBS', date: new Date() });

    expect(ibs.isPlaceholder).toBe(false);
    expect(cbs.isPlaceholder).toBe(false);
  });

  it('confirma no banco que as 27 linhas de ICMS nascem isPlaceholder=true e IBS/CBS nascem false', async () => {
    const icmsRates = await admin.taxRate.findMany({ where: { taxType: 'ICMS' } });
    const otherRates = await admin.taxRate.findMany({
      where: { taxType: { in: ['IBS', 'CBS'] } },
    });

    expect(icmsRates.length).toBeGreaterThan(0);
    expect(icmsRates.every((r) => r.isPlaceholder)).toBe(true);
    expect(otherRates.length).toBeGreaterThan(0);
    expect(otherRates.every((r) => !r.isPlaceholder)).toBe(true);
  });
});
