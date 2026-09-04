import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Trava a modelagem de D-018 antes de Trip existir: Vehicle é a unidade
// individual (cavalo mecânico e carreta são cadastros separados, cada um
// com placa e RENAVAM próprios). A composição — qual cavalo puxa qual
// carreta numa viagem — pertence à viagem, nunca ao cadastro.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

describe('Vehicle · não carrega referência a reboque (D-018)', () => {
  afterAll(async () => {
    await admin.$disconnect();
  });

  it('não tem coluna de composição (reboque, carreta, cavalo)', async () => {
    const columns = await admin.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Vehicle'
    `;
    const names = columns.map((c) => c.column_name.toLowerCase());

    // Se esse teste falhar, alguém adicionou uma referência de composição
    // ao cadastro — exatamente o padrão que D-018 reservou para a viagem.
    const compositionLike = names.filter((n) =>
      /trailer|reboque|composic|attached|cavalo.*id|carreta.*id/.test(n),
    );

    expect(compositionLike).toEqual([]);
  });

  it('não tem foreign key referenciando a própria tabela', async () => {
    const selfReferencingFks = await admin.$queryRaw<
      { constraint_name: string }[]
    >`
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'Vehicle'
        AND ccu.table_name = 'Vehicle'
    `;

    expect(selfReferencingFks).toEqual([]);
  });
});
