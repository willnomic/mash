import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureTripStatusesSeeded } from './helpers/seed-trip-statuses.js';
import { seedInvoiceScenario } from './helpers/seed-invoice-scenario.js';

// Roda contra o PostgreSQL real do docker-compose — D-042: metadado do
// anexo (canhoto, PDF de boleto). O storage de objeto em si (Cloudflare
// R2) não está integrado nesta unidade — o que se prova aqui é a
// garantia que sustenta "download só depois da checagem de tenant no
// banco": a linha de metadado, que qualquer geração de URL assinada
// precisaria consultar primeiro, já não é visível fora do tenant certo.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Attachment", "ReceivableEvent", "Boleto", "Invoice", "Trip", "RiskClearance", "Order", "Quote", "FreightRate", "Lane", "Address", "Party", "Vehicle", "Driver", "Branch", "Tenant" CASCADE`;

describe('Attachment · Row-Level Security e imutabilidade (D-042)', () => {
  let a: Awaited<ReturnType<typeof seedInvoiceScenario>>;
  let b: Awaited<ReturnType<typeof seedInvoiceScenario>>;
  let userA: { id: string };

  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    a = await seedInvoiceScenario(admin, 'A', 'transportadora-a');
    b = await seedInvoiceScenario(admin, 'B', 'transportadora-b');
    userA = await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: a.tenant.id,
        email: 'financeiro@transportadora-a.example',
        passwordHash: 'x',
        name: 'Financeiro A',
        role: 'FINANCE',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureTripStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  async function createPod(
    seed: Awaited<ReturnType<typeof seedInvoiceScenario>>,
    uploadedByUserId: string,
  ) {
    return admin.attachment.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        ownerType: 'TRIP',
        ownerId: seed.trip.id,
        type: 'PROOF_OF_DELIVERY',
        objectKey: `${seed.tenant.id}/trip/${seed.trip.id}/${uuidv7()}.jpg`,
        contentHash: 'a'.repeat(64),
        sizeBytes: 1_200_000,
        uploadedByUserId,
      },
    });
  }

  it('não enxerga anexo de outro tenant', async () => {
    const userB = await admin.user.create({
      data: {
        id: uuidv7(),
        tenantId: b.tenant.id,
        email: 'financeiro@transportadora-b.example',
        passwordHash: 'x',
        name: 'Financeiro B',
        role: 'FINANCE',
      },
    });
    await createPod(a, userA.id);
    await createPod(b, userB.id);

    const attachments = await forTenant(a.tenant.id).attachment.findMany();

    expect(attachments).toHaveLength(1);
    expect(attachments[0].tenantId).toBe(a.tenant.id);
  });

  it('"download" de outro tenant recusado — busca pela chave específica não acha a linha fora do tenant certo', async () => {
    const pod = await createPod(a, userA.id);

    // Simula exatamente o primeiro passo de qualquer geração futura de
    // URL assinada: achar o metadado pelo id, dentro do tenant da
    // sessão. Tenant B pedindo o anexo do tenant A não acha nada — não
    // existe URL a gerar pra quem não devia ver.
    const foundByB = await forTenant(b.tenant.id).attachment.findUnique({
      where: { id: pod.id },
    });

    expect(foundByB).toBeNull();
  });

  it('impede gravar no tenant alheio', async () => {
    await expect(
      forTenant(a.tenant.id).attachment.create({
        data: {
          id: uuidv7(),
          tenantId: b.tenant.id,
          ownerType: 'TRIP',
          ownerId: b.trip.id,
          type: 'PROOF_OF_DELIVERY',
          objectKey: 'x',
          contentHash: 'a'.repeat(64),
          sizeBytes: 100,
          uploadedByUserId: userA.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('aceita anexo em dois donos diferentes — TRIP (canhoto) e BOLETO (PDF)', async () => {
    const boleto = await admin.boleto.create({
      data: {
        id: uuidv7(),
        tenantId: a.tenant.id,
        invoiceId: a.invoice.id,
        number: '1',
        dueDate: new Date('2026-10-10'),
        amount: '500',
        digitableLine: '34191.79001 01043.510047 91020.150008 1 96380000015000',
      },
    });

    const pod = await createPod(a, userA.id);
    const boletoPdf = await admin.attachment.create({
      data: {
        id: uuidv7(),
        tenantId: a.tenant.id,
        ownerType: 'BOLETO',
        ownerId: boleto.id,
        type: 'BOLETO_PDF',
        objectKey: `${a.tenant.id}/boleto/${boleto.id}/${uuidv7()}.pdf`,
        contentHash: 'b'.repeat(64),
        sizeBytes: 45_000,
        uploadedByUserId: userA.id,
      },
    });

    expect(pod.ownerType).toBe('TRIP');
    expect(boletoPdf.ownerType).toBe('BOLETO');
  });

  it('impede UPDATE — append-only, anexo errado é linha nova', async () => {
    const pod = await createPod(a, userA.id);

    await expect(
      forTenant(a.tenant.id).attachment.update({
        where: { id: pod.id },
        data: { objectKey: 'outro' },
      }),
    ).rejects.toThrow();
  });

  it('impede DELETE', async () => {
    const pod = await createPod(a, userA.id);

    await expect(
      forTenant(a.tenant.id).attachment.delete({ where: { id: pod.id } }),
    ).rejects.toThrow();
  });
});
