import { Injectable } from '@nestjs/common';
import { Prisma, type BusinessDocumentType } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';

// Numeração de negócio (D-015) — nunca SEQUENCE do Postgres: sequence
// consome número em rollback, abre buraco, e buraco de CT-e exige
// inutilização junto à SEFAZ. DocumentCounter é tabela comum,
// incrementada sob SELECT ... FOR UPDATE.
//
// Recebe `tx`, não injeta TenantPrisma: só faz sentido chamado de DENTRO
// da mesma transação que grava a entidade numerada (TenantPrisma.
// transaction) — combinar as duas escritas na mesma transação é o que
// garante "sem buraco": se a criação falhar depois, o ROLLBACK desfaz o
// incremento também, porque é UPDATE numa tabela normal, não nextval()
// de SEQUENCE (que nunca é desfeito).
@Injectable()
export class NumberingService {
  async nextNumber(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      branchId: string;
      documentType: BusinessDocumentType;
      series?: string;
    },
  ): Promise<number> {
    const series = params.series ?? '1';

    // Bootstrap idempotente: a primeira chamada pra este escopo cria a
    // linha do contador; chamadas seguintes (concorrentes ou não) batem
    // em DO NOTHING e seguem pro SELECT abaixo. Não é get-or-create em
    // dois passos com corrida entre eles — o índice único do escopo
    // (tenantId+branchId+documentType+series) garante que só uma linha
    // sobrevive mesmo se duas transações tentarem inserir ao mesmo tempo.
    await tx.$executeRaw`
      INSERT INTO "DocumentCounter"
        (id, "tenantId", "branchId", "documentType", series, "lastNumber", "createdAt", "updatedAt")
      VALUES
        (${uuidv7()}::uuid, ${params.tenantId}::uuid, ${params.branchId}::uuid,
         ${params.documentType}::"BusinessDocumentType", ${series}, 0, now(), now())
      ON CONFLICT ("tenantId", "branchId", "documentType", "series") DO NOTHING
    `;

    // Trava a linha do escopo — qualquer outra transação pedindo número
    // no MESMO escopo bloqueia aqui até esta transação commitar ou dar
    // rollback. É essa espera, não um valor calculado no cliente, que
    // impede duas transações concorrentes lerem o mesmo lastNumber.
    const locked = await tx.$queryRaw<{ lastNumber: number }[]>`
      SELECT "lastNumber" FROM "DocumentCounter"
      WHERE "tenantId" = ${params.tenantId}::uuid
        AND "branchId" = ${params.branchId}::uuid
        AND "documentType" = ${params.documentType}::"BusinessDocumentType"
        AND series = ${series}
      FOR UPDATE
    `;

    const next = locked[0].lastNumber + 1;

    await tx.$executeRaw`
      UPDATE "DocumentCounter"
      SET "lastNumber" = ${next}, "updatedAt" = now()
      WHERE "tenantId" = ${params.tenantId}::uuid
        AND "branchId" = ${params.branchId}::uuid
        AND "documentType" = ${params.documentType}::"BusinessDocumentType"
        AND series = ${series}
    `;

    return next;
  }
}
