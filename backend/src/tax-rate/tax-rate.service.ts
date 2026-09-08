import { Injectable } from '@nestjs/common';
import { Prisma, type TaxType } from '@prisma/client';

// Ambientes onde uma alíquota placeholder (TaxRate.isPlaceholder) pode
// ser usada. Fora destes, findRate() recusa — ver comentário abaixo.
const SAFE_ENVIRONMENTS_FOR_PLACEHOLDER = new Set(['development', 'test']);

// Alíquota vigente numa data (D-041/D-014, mesmo mecanismo de vigência
// do FreightRate). Recebe `tx` diretamente, não injeta TenantPrisma —
// TaxRate não tem tenantId (D-041: é valor de lei, não configuração de
// tenant), mas quem chama (QuoteService.close()) já está dentro de uma
// transação por causa do resto do fechamento, então reaproveita a mesma
// conexão, mesmo padrão do NumberingService.
//
// Parametrizado por data, não "agora" implícito: é o que permite recotar
// uma data passada com a alíquota daquela data, não a de hoje (D-041).
@Injectable()
export class TaxRateService {
  async findRate(
    tx: Prisma.TransactionClient,
    params: { taxType: TaxType; uf?: string | null; date: Date },
  ) {
    const rate = await tx.taxRate.findFirstOrThrow({
      where: {
        taxType: params.taxType,
        uf: params.uf ?? null,
        validFrom: { lte: params.date },
        validTo: { gt: params.date },
      },
    });

    // As 27 linhas de ICMS semeadas na migração (D-041) são placeholder
    // — um valor uniforme (18%) só pra tabela nascer populada, nunca
    // pesquisado por estado (CLAUDE.md 1.6: ICMS nunca se responde de
    // memória). Um comentário no seed não impede ninguém de gerar preço
    // real com ele — esta recusa em código é o que impede. Fora de
    // dev/test (NODE_ENV), uma alíquota marcada `isPlaceholder` nunca sai
    // como cálculo válido; é erro, não aviso — "melhor dizer não sei do
    // que afirmar algo não verificado" (CLAUDE.md, regra suprema) pesa
    // mais aqui do que deixar a cotação sair com número inventado.
    if (
      rate.isPlaceholder &&
      !SAFE_ENVIRONMENTS_FOR_PLACEHOLDER.has(process.env.NODE_ENV ?? '')
    ) {
      throw new Error(
        `TaxRate placeholder (${params.taxType}${params.uf ? `/${params.uf}` : ''}) não calibrada — recusado fora de dev/test (NODE_ENV=${process.env.NODE_ENV ?? '(vazio)'}). Calibrar com o contador antes de usar em produção (D-041).`,
      );
    }

    return rate;
  }
}
