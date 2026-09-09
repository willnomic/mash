import { Injectable } from '@nestjs/common';
import { Prisma, type TaxType } from '@prisma/client';

// Ambientes onde uma alíquota placeholder (TaxRate.isPlaceholder) pode
// ser usada. Fora destes, findRate() recusa — ver comentário abaixo.
const SAFE_ENVIRONMENTS_FOR_PLACEHOLDER = new Set(['development', 'test']);

// ICMS intramunicipal — mesmo município de origem e destino — não é
// linha de TaxRate (D-043, consulta tributária,
// docs/consulta-tributaria-2026-09.md: "3. Intramunicipal: sem ICMS").
// Diferente das outras alíquotas desta tabela, isso não é uma alíquota
// que uma UF pode mudar por lei — é fronteira de competência tributária
// (transporte intramunicipal é ISS, não ICMS), fato estrutural sem
// vigência própria. Por isso é constante, não busca no banco.
export const ICMS_INTRAMUNICIPAL_RATE = new Prisma.Decimal(0);

// UFs que a Resolução do Senado classifica como "Sul/Sudeste, exceto
// ES" pro cálculo de ICMS interestadual (D-043, consulta tributária) —
// geografia fixa por lei, não domínio configurável por tenant (D-020,
// mesmo critério que mantém AnttCategory/VehicleType como enum: "lista
// fixa por lei ou pelo sistema permanece enum", aqui uma constante de
// código em vez de enum porque não é usada como tipo de coluna em
// lugar nenhum, só como critério de decisão).
const SUL_SUDESTE_EXCETO_ES = new Set(['PR', 'SC', 'RS', 'SP', 'RJ', 'MG']);

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
  // Serve IBS, CBS, e ICMS do caso INTERNA (D-043: origem e destino na
  // mesma UF — `uf` identifica qual). Para ICMS interestadual, use
  // findInterstateIcmsRate(): passar taxType=ICMS sem uf aqui não tem
  // como escolher entre as duas linhas interestaduais (7%/12%, ambas
  // com uf nulo e mesma vigência) — em vez de devolver uma das duas
  // arbitrariamente, recusa explícito.
  async findRate(
    tx: Prisma.TransactionClient,
    params: { taxType: TaxType; uf?: string | null; date: Date },
  ) {
    if (params.taxType === 'ICMS' && !params.uf) {
      throw new Error(
        'findRate() não serve ICMS sem uf — o caso INTERNA exige uf, e ' +
          'ICMS interestadual (uf nulo) tem duas linhas com a mesma ' +
          'vigência (7%/12%): use findInterstateIcmsRate() (D-043).',
      );
    }

    const rate = await tx.taxRate.findFirstOrThrow({
      where: {
        taxType: params.taxType,
        uf: params.uf ?? null,
        validFrom: { lte: params.date },
        validTo: { gt: params.date },
      },
    });

    // As 27 linhas de ICMS interna semeadas na migração (D-041) são
    // placeholder — um valor uniforme (18%) só pra tabela nascer
    // populada, nunca pesquisado por estado (CLAUDE.md 1.6: ICMS nunca
    // se responde de memória). Um comentário no seed não impede ninguém
    // de gerar preço real com ele — esta recusa em código é o que
    // impede. Fora de dev/test (NODE_ENV), uma alíquota marcada
    // `isPlaceholder` nunca sai como cálculo válido; é erro, não aviso —
    // "melhor dizer não sei do que afirmar algo não verificado"
    // (CLAUDE.md, regra suprema) pesa mais aqui do que deixar a cotação
    // sair com número inventado.
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

  // ICMS interestadual (D-043, consulta tributária): 7% quando a origem
  // é Sul/Sudeste exceto ES E o destino é Norte/Nordeste/Centro-Oeste/ES;
  // 12% em todo o resto — regra por GRUPO de UF, não por par específico
  // (não é matriz 27x27, só duas linhas em TaxRate). Não é simétrico: só
  // essa combinação específica de direção dá 7%, qualquer outra
  // (incluindo a mesma rota ao contrário) cai em 12%.
  async findInterstateIcmsRate(
    tx: Prisma.TransactionClient,
    params: { originUf: string; destinationUf: string; date: Date },
  ) {
    const isSevenPercentCase =
      SUL_SUDESTE_EXCETO_ES.has(params.originUf) &&
      !SUL_SUDESTE_EXCETO_ES.has(params.destinationUf);

    return tx.taxRate.findFirstOrThrow({
      where: {
        taxType: 'ICMS',
        icmsOperationType: isSevenPercentCase
          ? 'INTERESTADUAL_7'
          : 'INTERESTADUAL_12',
        validFrom: { lte: params.date },
        validTo: { gt: params.date },
      },
    });
  }
}
