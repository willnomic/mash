import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { base, forTenant } from '../src/prisma/prisma-tenant.js';
import { ensureQuoteStatusesSeeded } from './helpers/seed-quote-statuses.js';

// Roda contra o PostgreSQL real do docker-compose (não mock: RLS é do
// banco). Unidade "papéis e permissões": Group/GroupPermission seguem o
// isolamento padrão por tenant (D-012); Permission é catálogo global
// (mesmo tratamento de TaxRate, D-041) — visível independente do tenant.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Group/GroupPermission · Row-Level Security (D-012)', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };
  let groupA: { id: string };
  let groupB: { id: string };

  beforeEach(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "GroupPermission", "Group", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    tenantA = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora A', slug: 'transportadora-a' },
    });
    tenantB = await admin.tenant.create({
      data: { id: uuidv7(), name: 'Transportadora B', slug: 'transportadora-b' },
    });
    groupA = await admin.group.create({
      data: { id: uuidv7(), tenantId: tenantA.id, name: 'Grupo A' },
    });
    groupB = await admin.group.create({
      data: { id: uuidv7(), tenantId: tenantB.id, name: 'Grupo B' },
    });
    const quoteViewPermission = await admin.permission.findFirstOrThrow({
      where: { code: 'quote.view' },
    });
    await admin.groupPermission.create({
      data: {
        id: uuidv7(),
        tenantId: tenantA.id,
        groupId: groupA.id,
        permissionId: quoteViewPermission.id,
      },
    });
  });

  afterAll(async () => {
    await admin.$executeRaw`TRUNCATE TABLE "GroupPermission", "Group", "Tenant" CASCADE`;
    await ensureQuoteStatusesSeeded(admin);
    await admin.$disconnect();
    await base.$disconnect();
  });

  describe('Group', () => {
    it('não enxerga grupo de outro tenant', async () => {
      const groups = await forTenant(tenantA.id).group.findMany();

      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe(groupA.id);
    });

    it('sem tenant definido, não retorna nada', async () => {
      const groups = await base.group.findMany();

      expect(groups).toHaveLength(0);
    });

    it('impede gravar no tenant alheio', async () => {
      await expect(
        forTenant(tenantA.id).group.create({
          data: { id: uuidv7(), tenantId: tenantB.id, name: 'Grupo forjado' },
        }),
      ).rejects.toThrow();
    });

    it('editar o grupo de um tenant não afeta o outro — "cada transportadora altera" (unidade "papéis e permissões")', async () => {
      await forTenant(tenantA.id).group.update({
        where: { id: groupA.id },
        data: { name: 'Grupo A renomeado' },
      });

      const stillB = await forTenant(tenantB.id).group.findUniqueOrThrow({
        where: { id: groupB.id },
      });
      expect(stillB.name).toBe('Grupo B');
    });
  });

  describe('GroupPermission', () => {
    it('não enxerga concessão de outro tenant', async () => {
      const grants = await forTenant(tenantA.id).groupPermission.findMany();

      expect(grants).toHaveLength(1);
      expect(grants[0].groupId).toBe(groupA.id);
    });

    it('sem tenant definido, não retorna nada', async () => {
      const grants = await base.groupPermission.findMany();

      expect(grants).toHaveLength(0);
    });
  });

  describe('Permission — catálogo global, não isolado por tenant (mesmo tratamento de TaxRate)', () => {
    it('é visível com qualquer tenant no contexto', async () => {
      const viaA = await forTenant(tenantA.id).permission.findMany();
      const viaB = await forTenant(tenantB.id).permission.findMany();

      expect(viaA.length).toBeGreaterThan(0);
      expect(viaA.length).toBe(viaB.length);
    });

    it('é visível mesmo SEM tenant nenhum no contexto — catálogo de sistema, não dado de tenant', async () => {
      const viaBase = await base.permission.findMany();

      expect(viaBase.length).toBeGreaterThan(0);
    });

    it('mash_app não consegue escrever — só migração adiciona permissão nova', async () => {
      await expect(
        forTenant(tenantA.id).permission.create({
          data: {
            id: uuidv7(),
            code: 'forjada.nova',
            module: 'FORJADO',
            name: 'Forjada',
          },
        }),
      ).rejects.toThrow();
    });
  });
});
