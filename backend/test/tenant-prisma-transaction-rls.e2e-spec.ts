import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { base } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { TenantPrisma } from '../src/tenant/tenant-prisma.service.js';

// Guarda no espírito do rls-schema-guard (D-012): TenantPrisma.transaction()
// (D-035) contorna o caminho normal do forTenant() — abre a transação
// direto no client base e chama set_config uma vez só. É necessário (D-035
// explica por quê), mas é um primitivo de uso restrito: se a implementação
// tivesse um bug (ex.: set_config sem TRUE, ou tx trocado por this.db no
// meio do callback), o isolamento entre tenants furaria em silêncio — os
// testes passariam, o RLS "existiria", e nenhuma linha de outro tenant
// apareceria até alguém notar em produção. Este arquivo prova que, hoje,
// isso não acontece; se um dia acontecer, é aqui que quebra.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function tenantPrismaFor(tenantId: string): TenantPrisma {
  const fakeCls = { get: () => tenantId } as unknown as ClsService;
  return new TenantPrisma(fakeCls);
}

describe('TenantPrisma.transaction() · continua protegido por RLS (D-012, D-035)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        personType: 'INDIVIDUAL',
        name: 'Cliente A',
        cpf: '52998224725',
      },
    });
    await admin.party.create({
      data: {
        id: uuidv7(),
        tenantId: tenantB.id,
        personType: 'COMPANY',
        name: 'Cliente B',
        cnpj: '11444777000161',
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Party", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('dentro de transaction(), consulta via tx.<model> não enxerga dado de outro tenant', async () => {
    const parties = await tenantPrismaFor(tenantA.id).transaction((tx) =>
      tx.party.findMany(),
    );

    expect(parties).toHaveLength(1);
    expect(parties[0].tenantId).toBe(tenantA.id);
  });

  it('dentro de transaction(), consulta crua (tx.$queryRaw) também não enxerga dado de outro tenant', async () => {
    const rows = await tenantPrismaFor(tenantA.id).transaction(
      (tx) => tx.$queryRaw`SELECT * FROM "Party"`,
    );

    expect(rows).toHaveLength(1);
  });

  it('dentro de transaction(), impede gravar no tenant alheio', async () => {
    await expect(
      tenantPrismaFor(tenantA.id).transaction((tx) =>
        tx.party.create({
          data: {
            id: uuidv7(),
            tenantId: tenantB.id,
            personType: 'INDIVIDUAL',
            name: 'Cliente forjado',
            cpf: '12345678909',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('duas transaction() concorrentes, tenants diferentes, não vazam uma pra outra', async () => {
    const [resultsA, resultsB] = await Promise.all([
      tenantPrismaFor(tenantA.id).transaction((tx) => tx.party.findMany()),
      tenantPrismaFor(tenantB.id).transaction((tx) => tx.party.findMany()),
    ]);

    expect(resultsA).toHaveLength(1);
    expect(resultsA[0].tenantId).toBe(tenantA.id);
    expect(resultsB).toHaveLength(1);
    expect(resultsB[0].tenantId).toBe(tenantB.id);
  });

  it('depois que transaction() termina, o contexto de tenant não vaza pra próxima conexão do pool', async () => {
    await tenantPrismaFor(tenantA.id).transaction((tx) => tx.party.findMany());

    // set_config(..., TRUE) é local à transação — desfaz sozinho no
    // commit (docs/d012-multi-tenant-rls.md, armadilha 2: "o pool de
    // conexões vaza tenant entre requisições"). Repete a consulta sem
    // tenant várias vezes pra aumentar a chance de reusar a MESMA conexão
    // física que acabou de voltar pro pool — se o set_config tivesse
    // vazado, pelo menos uma dessas leituras veria a linha da Party A.
    for (let i = 0; i < 5; i++) {
      const rows = await base.party.findMany();
      expect(rows).toHaveLength(0);
    }
  });
});
