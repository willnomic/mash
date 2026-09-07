import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
import type { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
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
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await ensureTripStatusesSeeded(admin);
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
});
