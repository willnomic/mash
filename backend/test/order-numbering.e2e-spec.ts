import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { OrderService } from '../src/order/order.service.js';
import { NumberingService } from '../src/numbering/numbering.service.js';
import { TenantPrisma } from '../src/tenant/tenant-prisma.service.js';

// Roda contra o PostgreSQL real do docker-compose — a garantia provada
// aqui (D-015: sem SEQUENCE, sem buraco, único sob concorrência) só
// existe no banco de verdade. Teste sequencial não prova nada sobre
// corrida; o teste que importa dispara N criações de verdade em paralelo
// (Promise.all — mesmo tick do event loop, sem await entre os disparos) e
// observa contenção real de lock via pg_stat_activity, não só confia que
// o resultado saiu certo por acaso.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TRUNCATE = `TRUNCATE TABLE "Order", "Quote", "FreightRate", "Lane", "Party", "DocumentCounter", "Branch", "Tenant" CASCADE`;

function tenantPrismaFor(tenantId: string): TenantPrisma {
  const fakeCls = { get: () => tenantId } as unknown as ClsService;
  return new TenantPrisma(fakeCls);
}

// Sem Order pré-criado — diferente de seedOrderScenario, que insere um
// Order com number:1 por fora do contador (o helper existe pra testes de
// Trip/RiskClearance que não se importam com numeração). Aqui o contador
// precisa nascer vazio de verdade.
async function seedTenant(name: string, slug: string) {
  const tenant = await admin.tenant.create({
    data: { id: uuidv7(), name, slug },
  });
  const branch = await admin.branch.create({
    data: { id: uuidv7(), tenantId: tenant.id, name: 'Matriz' },
  });
  const party = await admin.party.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      personType: 'COMPANY',
      name: `Cliente ${name}`,
      cnpj: '11444777000161',
    },
  });
  const lane = await admin.lane.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      originCity: 'São Paulo',
      originState: 'SP',
      destinationCity: 'Curitiba',
      destinationState: 'PR',
    },
  });
  const freightRate = await admin.freightRate.create({
    data: {
      id: uuidv7(),
      tenantId: tenant.id,
      partyId: party.id,
      laneId: lane.id,
      validFrom: new Date('2026-01-01'),
      validTo: new Date('9999-12-31'),
      rate: '150.5',
      minimumFreight: '500',
      additionalPercentage: '2.5',
    },
  });
  return { tenant, branch, party, lane, freightRate };
}

// Poll em pg_stat_activity, numa conexão separada (admin, não o pool de
// mash_app usado pelas transações sob teste) — evidência real de que
// alguma transação ficou esperando o lock de linha do SELECT ... FOR
// UPDATE do DocumentCounter, não só que o resultado final bateu.
async function observeLockContention(
  shouldStop: () => boolean,
): Promise<boolean> {
  while (!shouldStop()) {
    const rows = await admin.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND query ILIKE '%DocumentCounter%'
        AND pid <> pg_backend_pid()
    `;
    if (Number(rows[0].n) > 0) return true;
  }
  return false;
}

describe('Order · numeração de negócio (D-015)', () => {
  beforeEach(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(TRUNCATE);
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('números saem sequenciais, sem pular, em criações sucessivas', async () => {
    const seed = await seedTenant('A', 'transportadora-a');
    const orderService = new OrderService(
      tenantPrismaFor(seed.tenant.id),
      new NumberingService(),
    );

    const numbers: number[] = [];
    for (let i = 0; i < 5; i++) {
      const order = await orderService.createFromFreightRate({
        freightRateId: seed.freightRate.id,
        branchId: seed.branch.id,
        senderId: seed.party.id,
        recipientId: seed.party.id,
        tomadorId: seed.party.id,
        total: '500',
      });
      numbers.push(order.number);
    }

    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });

  it('unicidade do número dentro do escopo tenant+branch é garantida no banco', async () => {
    const seed = await seedTenant('A', 'transportadora-a');

    await admin.order.create({
      data: {
        id: uuidv7(),
        tenantId: seed.tenant.id,
        branchId: seed.branch.id,
        number: 1,
        freightRateId: seed.freightRate.id,
        senderId: seed.party.id,
        recipientId: seed.party.id,
        tomadorId: seed.party.id,
        rate: '150.5',
        minimumFreight: '500',
        additionalPercentage: '2.5',
        total: '500',
      },
    });

    await expect(
      forTenant(seed.tenant.id).order.create({
        data: {
          id: uuidv7(),
          tenantId: seed.tenant.id,
          branchId: seed.branch.id,
          number: 1, // mesmo número, mesmo tenant+branch — recusado pelo banco
          freightRateId: seed.freightRate.id,
          senderId: seed.party.id,
          recipientId: seed.party.id,
          tomadorId: seed.party.id,
          rate: '150.5',
          minimumFreight: '500',
          additionalPercentage: '2.5',
          total: '500',
        },
      }),
    ).rejects.toThrow();
  });

  it('DocumentCounter: UPDATE de lastNumber liberado, identidade do escopo recusada', async () => {
    const seed = await seedTenant('A', 'transportadora-a');
    const orderService = new OrderService(
      tenantPrismaFor(seed.tenant.id),
      new NumberingService(),
    );
    await orderService.createFromFreightRate({
      freightRateId: seed.freightRate.id,
      branchId: seed.branch.id,
      senderId: seed.party.id,
      recipientId: seed.party.id,
      tomadorId: seed.party.id,
      total: '500',
    });

    const counter = await admin.documentCounter.findFirstOrThrow({
      where: { tenantId: seed.tenant.id },
    });

    await expect(
      forTenant(seed.tenant.id).documentCounter.update({
        where: { id: counter.id },
        data: { lastNumber: 999 },
      }),
    ).resolves.toBeTruthy();

    await expect(
      forTenant(seed.tenant.id).documentCounter.update({
        where: { id: counter.id },
        data: { series: '2' },
      }),
    ).rejects.toThrow();
  });

  it('impede apagar um DocumentCounter — reabriria números já emitidos', async () => {
    const seed = await seedTenant('A', 'transportadora-a');
    const orderService = new OrderService(
      tenantPrismaFor(seed.tenant.id),
      new NumberingService(),
    );
    await orderService.createFromFreightRate({
      freightRateId: seed.freightRate.id,
      branchId: seed.branch.id,
      senderId: seed.party.id,
      recipientId: seed.party.id,
      tomadorId: seed.party.id,
      total: '500',
    });
    const counter = await admin.documentCounter.findFirstOrThrow({
      where: { tenantId: seed.tenant.id },
    });

    await expect(
      forTenant(seed.tenant.id).documentCounter.delete({
        where: { id: counter.id },
      }),
    ).rejects.toThrow();
  });

  it('sem buraco: transação que pega o número e depois falha não desperdiça o número', async () => {
    const seed = await seedTenant('A', 'transportadora-a');
    const tenantPrisma = tenantPrismaFor(seed.tenant.id);
    const numberingService = new NumberingService();
    const orderService = new OrderService(tenantPrisma, numberingService);

    let leakedNumber: number | undefined;

    // Pega o número dentro de uma transação, mas força o rollback antes
    // de gravar qualquer entidade — simula uma criação que falha depois
    // de já ter consultado o contador (ex.: uma validação posterior
    // rejeita). Se isso fosse SEQUENCE, o número teria vazado pra sempre.
    await expect(
      tenantPrisma.transaction(async (tx) => {
        leakedNumber = await numberingService.nextNumber(tx, {
          tenantId: seed.tenant.id,
          branchId: seed.branch.id,
          documentType: 'ORDER',
        });
        throw new Error('falha proposital depois de pegar o número');
      }),
    ).rejects.toThrow('falha proposital');

    expect(leakedNumber).toBe(1);

    // Criação real, depois do rollback: tem que reaproveitar o número 1,
    // não pular pro 2 — prova que o ROLLBACK desfez o incremento do
    // contador junto com o resto da transação abortada.
    const order = await orderService.createFromFreightRate({
      freightRateId: seed.freightRate.id,
      branchId: seed.branch.id,
      senderId: seed.party.id,
      recipientId: seed.party.id,
      tomadorId: seed.party.id,
      total: '500',
    });

    expect(order.number).toBe(1);
  });

  it('concorrência real: N criações simultâneas produzem N números distintos, sem buraco, com contenção de lock observada de verdade', async () => {
    const seed = await seedTenant('A', 'transportadora-a');
    const CONCURRENCY = 10; // dentro do pool padrão do pg (max: 10) —
    // as 10 conexões cabem simultaneamente sem fila no driver, então a
    // corrida acontece de verdade no banco, não por acaso na aplicação.

    let stop = false;
    const contentionPromise = observeLockContention(() => stop);

    const creates = Array.from({ length: CONCURRENCY }, () => {
      // Cada chamada usa sua PRÓPRIA TenantPrisma/OrderService — não
      // reaproveita objeto entre disparos, pra não mascarar acidentalmente
      // nenhum estado compartilhado do lado da aplicação. Todas apontam
      // pro mesmo base/pool (prisma-tenant.ts): é aí que a corrida real
      // acontece, quando cada uma tenta uma conexão distinta do pool.
      const orderService = new OrderService(
        tenantPrismaFor(seed.tenant.id),
        new NumberingService(),
      );
      return orderService.createFromFreightRate({
        freightRateId: seed.freightRate.id,
        branchId: seed.branch.id,
        senderId: seed.party.id,
        recipientId: seed.party.id,
        tomadorId: seed.party.id,
        total: '500',
      });
    });

    // Promise.all, não um loop com await: todas as CONCURRENCY chamadas
    // disparam no mesmo tick, antes de qualquer uma resolver — é isso que
    // torna o teste sequencial incapaz de provar isolamento e este capaz.
    const orders = await Promise.all(creates);
    stop = true;
    const contentionObserved = await contentionPromise;

    const numbers = orders.map((o) => o.number).sort((a, b) => a - b);
    const expected = Array.from({ length: CONCURRENCY }, (_, i) => i + 1);

    // Prova de corretude: N números distintos, formando exatamente
    // {1..N} — nem duplicado (duas transações levando o mesmo número),
    // nem buraco (uma transação pulando um número que devia existir).
    expect(new Set(numbers).size).toBe(CONCURRENCY);
    expect(numbers).toEqual(expected);

    // Prova de que a corrida foi real, não só "deu certo por sorte": se
    // isto for false, o teste acima não prova isolamento sob concorrência
    // — só que o resultado bateu desta vez. Reportando explícito em vez
    // de deixar passar calado (pedido explícito do usuário).
    if (!contentionObserved) {
      console.warn(
        'ATENÇÃO: nenhuma contenção de lock foi observada em pg_stat_activity ' +
          'durante o teste de concorrência — não há evidência de que as ' +
          `${CONCURRENCY} criações realmente competiram pelo mesmo lock de ` +
          'linha no banco. O resultado (números corretos) pode ter saído ' +
          'por execução coincidentemente serial, não por isolamento sob ' +
          'corrida real. Rode de novo ou investigue o polling antes de ' +
          'confiar nesta prova.',
      );
    }
    expect(contentionObserved).toBe(true);
  });
});
