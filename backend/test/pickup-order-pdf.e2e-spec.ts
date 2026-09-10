import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
import type { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { ensureDayPeriodsSeeded } from './helpers/seed-day-periods.js';
import { seedPickupOrderScenario } from './helpers/seed-pickup-order-scenario.js';
import { PickupOrderService } from '../src/pickup-order/pickup-order.service.js';
import { TenantPrisma } from '../src/tenant/tenant-prisma.service.js';

// Roda contra o PostgreSQL real do docker-compose — e gera o PDF de
// verdade (pdfkit) e lê ele de volta com pdf-parse. Não confia em mock:
// a garantia que este arquivo prova (layout de fluxo vertical não corta
// texto nem sobrepõe quando o conteúdo varia de 1 pra 40 itens) só existe
// olhando os bytes reais.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "PickupOrderItem", "PickupOrder", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;

function tenantPrismaFor(tenantId: string): TenantPrisma {
  const fakeCls = { get: () => tenantId } as unknown as ClsService;
  return new TenantPrisma(fakeCls);
}

describe('PickupOrder · geração de PDF (D-027)', () => {
  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
    await ensureDayPeriodsSeeded(admin);
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
    await ensureDayPeriodsSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('1 item: PDF válido de uma página só, com os campos certos', async () => {
    const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1);
    const service = new PickupOrderService(tenantPrismaFor(seed.tenant.id));

    const buffer = await service.generatePdf(seed.pickupOrder.id);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');

    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();

    expect(result.total).toBe(1);
    expect(result.text).toContain('Cliente A'); // sender/recipient/tomador
    expect(result.text).toContain('Motorista A');
    expect(result.text).toContain('52998224725'); // CPF do motorista
    expect(result.text).toContain('ABC1D23'); // placa do cavalo
    expect(result.text).toContain('Rua A'); // endereço de coleta
    expect(result.text).toContain('Doca 3'); // locationLabel
    expect(result.text).toContain('NF-e 12345');
    expect(result.text).toContain('ROM-0099');
    expect(result.text).toContain('Item 1 — caixa de peças automotivas');
  });

  it('40 itens: produz mais de uma página, sem texto cortado, com o último item presente', async () => {
    const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 40);
    const service = new PickupOrderService(tenantPrismaFor(seed.tenant.id));

    const buffer = await service.generatePdf(seed.pickupOrder.id);

    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();

    // Não confia em conferência visual: contagem de página real e texto
    // extraído contendo o último item — se o layout cortasse ou
    // sobrepusesse, o item 40 não apareceria intacto no texto extraído.
    expect(result.total).toBeGreaterThan(1);
    expect(result.text).toContain('Item 40 — caixa de peças automotivas');

    // Todos os 40 itens aparecem — nenhuma linha perdida na quebra de
    // página.
    for (let i = 1; i <= 40; i++) {
      expect(result.text).toContain(`Item ${i} — caixa de peças automotivas`);
    }

    // O cabeçalho de identificação repete em toda página — o motorista
    // sabe de que coleta é cada folha, inclusive a segunda.
    const continuationCount = (result.text.match(/ORDEM DE COLETA \(continuação\)/g) ?? [])
      .length;
    expect(continuationCount).toBe(result.total - 1);
  });

  it('impede alterar o PickupOrder — corrigir é emitir de novo (D-011/D-017)', async () => {
    const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1);

    await expect(
      forTenant(seed.tenant.id).pickupOrder.update({
        where: { id: seed.pickupOrder.id },
        data: { locationLabel: 'Outra doca' },
      }),
    ).rejects.toThrow();
  });

  it('impede apagar o PickupOrder', async () => {
    const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1);

    await expect(
      forTenant(seed.tenant.id).pickupOrder.delete({
        where: { id: seed.pickupOrder.id },
      }),
    ).rejects.toThrow();
  });

  it('impede alterar um PickupOrderItem', async () => {
    const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1);
    const item = seed.pickupOrder.items[0];

    await expect(
      forTenant(seed.tenant.id).pickupOrderItem.update({
        where: { id: item.id },
        data: { quantity: 99 },
      }),
    ).rejects.toThrow();
  });

  it('impede apagar um PickupOrderItem', async () => {
    const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1);
    const item = seed.pickupOrder.items[0];

    await expect(
      forTenant(seed.tenant.id).pickupOrderItem.delete({
        where: { id: item.id },
      }),
    ).rejects.toThrow();
  });

  it('gerar PDF de um PickupOrder inexistente falha', async () => {
    const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1);
    const service = new PickupOrderService(tenantPrismaFor(seed.tenant.id));

    await expect(service.generatePdf(uuidv7())).rejects.toThrow();
  });

  // D-045 — a janela de coleta no PDF passa a vir de formatTimeWindow
  // (@mash/shared), não de texto livre, quando há algo estruturado. As
  // sete formas cobrem as seis precisões de TimeWindow que carregam
  // horário/período, mais o fallback pra pickupTimeNote quando não há
  // nada estruturado. Cada asserção confere o texto exato que
  // formatTimeWindow produz — já coberto campo a campo em
  // shared/src/time-window/time-window.formatter.spec.ts; aqui a prova é
  // que ele chega inteiro no PDF real, extraído de volta com pdf-parse.
  describe('janela de coleta — sete formas de TimeWindow (D-045)', () => {
    async function pdfText(seed: Awaited<ReturnType<typeof seedPickupOrderScenario>>) {
      const service = new PickupOrderService(tenantPrismaFor(seed.tenant.id));
      const buffer = await service.generatePdf(seed.pickupOrder.id);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }

    it('faixa: "10/09, das 08h00 às 10h00"', async () => {
      const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1, {
        pickupStartTime: '08:00',
        pickupEndTime: '10:00',
      });

      expect(await pdfText(seed)).toContain('Janela de coleta: 10/09, das 08h00 às 10h00');
    });

    it('exato: "10/09, às 08h00"', async () => {
      const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1, {
        pickupStartTime: '08:00',
        pickupEndTime: '08:00',
      });

      expect(await pdfText(seed)).toContain('Janela de coleta: 10/09, às 08h00');
    });

    it('até: "10/09, até as 17h30"', async () => {
      const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1, {
        pickupEndTime: '17:30',
      });

      expect(await pdfText(seed)).toContain('Janela de coleta: 10/09, até as 17h30');
    });

    it('a partir de: "10/09, a partir das 13h00"', async () => {
      const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1, {
        pickupStartTime: '13:00',
      });

      expect(await pdfText(seed)).toContain('Janela de coleta: 10/09, a partir das 13h00');
    });

    it('período: "10/09, Pela manhã" — rótulo vindo de DayPeriod.name', async () => {
      const morning = await admin.dayPeriod.findFirstOrThrow({
        where: { code: 'MORNING', tenantId: null },
      });
      const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1, {
        pickupDayPeriodId: morning.id,
      });

      expect(await pdfText(seed)).toContain('Janela de coleta: 10/09, Pela manhã');
    });

    it('cruzando meia-noite: "10/09, das 22h00 às 00h00 do dia seguinte"', async () => {
      const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1, {
        pickupStartTime: '22:00',
        pickupEndTime: '00:00',
        pickupEndsNextDay: true,
      });

      expect(await pdfText(seed)).toContain(
        'Janela de coleta: 10/09, das 22h00 às 00h00 do dia seguinte',
      );
    });

    it('só nota: nada estruturado cai em pickupTimeNote, texto livre', async () => {
      const seed = await seedPickupOrderScenario(admin, 'A', 'transportadora-a', 1, {
        pickupTimeNote: 'Combinar direto com o motorista',
      });

      expect(await pdfText(seed)).toContain(
        'Janela de coleta: Combinar direto com o motorista',
      );
    });
  });
});
