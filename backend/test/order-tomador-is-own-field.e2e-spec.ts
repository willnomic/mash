import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Trava a modelagem de D-018: tomador é campo próprio e obrigatório,
// nunca inferido de remetente/destinatário. Prova que existe como coluna
// real, obrigatória, não computada — não um valor derivado em runtime.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Order · tomador é campo próprio, não derivado (D-018)', () => {
  afterAll(async () => {
    await admin.$disconnect();
  });

  it('tomadorId existe como coluna própria, obrigatória e não computada', async () => {
    const columns = await admin.$queryRaw<
      { column_name: string; is_nullable: string; is_generated: string }[]
    >`
      SELECT column_name, is_nullable, is_generated
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Order'
        AND column_name IN ('senderId', 'recipientId', 'tomadorId')
      ORDER BY column_name
    `;

    expect(columns).toHaveLength(3);
    for (const column of columns) {
      expect(column.is_nullable).toBe('NO');
      // "NEVER" = coluna comum, não GENERATED ALWAYS AS (...) — não é
      // derivada de remetente/destinatário em tempo de leitura.
      expect(column.is_generated).toBe('NEVER');
    }
  });

  it('tomadorId é uma foreign key própria para Customer, distinta de remetente/destinatário', async () => {
    const fks = await admin.$queryRaw<
      { column_name: string; foreign_table: string }[]
    >`
      SELECT kcu.column_name, ccu.table_name AS foreign_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'Order'
        AND kcu.column_name IN ('senderId', 'recipientId', 'tomadorId')
      ORDER BY kcu.column_name
    `;

    expect(fks).toHaveLength(3);
    expect(fks.every((fk) => fk.foreign_table === 'Customer')).toBe(true);
    // Três FKs distintas para o mesmo Customer — não uma tabela de papel
    // genérica nem um "tipo" no cadastro do Customer.
    const columnNames = fks.map((fk) => fk.column_name).sort();
    expect(columnNames).toEqual([
      'recipientId',
      'senderId',
      'tomadorId',
    ]);
  });
});
