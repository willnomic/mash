import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';
import { TenantsService } from '../src/tenant/tenants.service.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: a garantia
// que este arquivo prova é a transação Tenant+Branch, e isso é do banco).
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('TenantsService · filial padrão nasce junto com o tenant (D-011)', () => {
  const tenantsService = new TenantsService();

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "Branch", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  it('criar um tenant cria a filial padrão automaticamente', async () => {
    const tenant = await tenantsService.create({
      name: 'Transportadora Nova',
      slug: 'transportadora-nova',
    });

    const branches = await forTenant(tenant.id).branch.findMany();

    expect(branches).toHaveLength(1);
    expect(branches[0].tenantId).toBe(tenant.id);
    expect(branches[0].name).toBe('Matriz');
  });

  it('a filial padrão pertence só ao tenant que a gerou', async () => {
    const tenantA = await tenantsService.create({
      name: 'Transportadora A',
      slug: 'transportadora-a',
    });
    const tenantB = await tenantsService.create({
      name: 'Transportadora B',
      slug: 'transportadora-b',
    });

    const branchesA = await forTenant(tenantA.id).branch.findMany();
    const branchesB = await forTenant(tenantB.id).branch.findMany();

    expect(branchesA).toHaveLength(1);
    expect(branchesB).toHaveLength(1);
    expect(branchesA[0].id).not.toBe(branchesB[0].id);
  });

  // Unidade "papéis e permissões": os dois grupos nascem junto com o
  // tenant, mesmo mecanismo que já semeia a filial padrão (D-030).
  describe('grupos padrão (Operador/Gestor)', () => {
    it('operador tem o fluxo comercial inteiro, sem configuração', async () => {
      const tenant = await tenantsService.create({
        name: 'Transportadora Nova',
        slug: 'transportadora-nova',
      });

      const operador = await forTenant(tenant.id).group.findFirstOrThrow({
        where: { name: 'Operador' },
        include: { groupPermissions: { include: { permission: true } } },
      });
      const codes = operador.groupPermissions
        .map((gp) => gp.permission.code)
        .sort();

      expect(codes).toEqual([
        'quote.accept',
        'quote.close',
        'quote.create',
        'quote.reject',
        'quote.view',
        'registration.create',
        'registration.view',
      ]);
    });

    it('gestor tem tudo do operador mais configuração', async () => {
      const tenant = await tenantsService.create({
        name: 'Transportadora Nova',
        slug: 'transportadora-nova',
      });

      const gestor = await forTenant(tenant.id).group.findFirstOrThrow({
        where: { name: 'Gestor' },
        include: { groupPermissions: { include: { permission: true } } },
      });
      const codes = gestor.groupPermissions
        .map((gp) => gp.permission.code)
        .sort();

      expect(codes).toEqual([
        'quote.accept',
        'quote.close',
        'quote.create',
        'quote.reject',
        'quote.view',
        'registration.create',
        'registration.view',
        'settings.change',
        'settings.view',
      ]);
    });

    it('os grupos de um tenant não vazam pro outro — editar um não afeta o outro', async () => {
      const tenantA = await tenantsService.create({
        name: 'Transportadora A',
        slug: 'transportadora-a',
      });
      const tenantB = await tenantsService.create({
        name: 'Transportadora B',
        slug: 'transportadora-b',
      });

      const operadorA = await forTenant(tenantA.id).group.findFirstOrThrow({
        where: { name: 'Operador' },
      });
      const operadorB = await forTenant(tenantB.id).group.findFirstOrThrow({
        where: { name: 'Operador' },
      });

      // São LINHAS diferentes — não a mesma linha global compartilhada
      // (diferente de QuoteStatus/DayPeriod, tenantId nulo): renomear o
      // grupo de A nunca toca o de B.
      expect(operadorA.id).not.toBe(operadorB.id);

      await forTenant(tenantA.id).group.update({
        where: { id: operadorA.id },
        data: { name: 'Operador (renomeado)' },
      });

      const stillOperadorB = await forTenant(tenantB.id).group.findUniqueOrThrow({
        where: { id: operadorB.id },
      });
      expect(stillOperadorB.name).toBe('Operador');
    });

    it('ensureDefaultGroups() é idempotente — não duplica se rodar de novo (script de backfill)', async () => {
      const tenant = await tenantsService.create({
        name: 'Transportadora Nova',
        slug: 'transportadora-nova',
      });

      await admin.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, TRUE)`;
        await tenantsService.seedDefaultGroups(tx, tenant.id);
      });

      const groups = await forTenant(tenant.id).group.findMany();
      expect(groups).toHaveLength(2);
    });
  });
});
