import type { QuoteValidityUnit } from '@prisma/client';
import type { QuoteValidityDecision } from '@mash/shared';

// Conversão entre as duas colunas de TenantSettings
// (defaultQuoteValidityUnit/Amount) e QuoteValidityDecision
// (@mash/shared) — usada por TenantSettingsService (ler/gravar a
// configuração) e por MeController (devolver o padrão pra pré-encher o
// fechamento de cotação, unidade "configuração do tenant"). Extraído
// pra um lugar só: a mesma conversão em dois arquivos seria a duplicação
// que o CLAUDE.md pede pra evitar.
export function toQuoteValidityDecision(
  settings: {
    defaultQuoteValidityUnit: QuoteValidityUnit | null;
    defaultQuoteValidityAmount: number | null;
  } | null,
): QuoteValidityDecision | null {
  if (!settings || settings.defaultQuoteValidityUnit === null) {
    return null;
  }
  if (settings.defaultQuoteValidityUnit === 'NEVER') {
    return { type: 'NEVER' };
  }
  // CHECK "TenantSettings_quote_validity_shape" no banco já garante
  // que amount não é nulo quando unit é DAYS/MONTHS/YEARS — o "!" só
  // estreita o tipo pro TypeScript, o banco é quem garante de verdade.
  return {
    type: 'TERM',
    term: {
      unit: settings.defaultQuoteValidityUnit,
      amount: settings.defaultQuoteValidityAmount!,
    },
  };
}

export function fromQuoteValidityDecision(decision: QuoteValidityDecision): {
  defaultQuoteValidityUnit: QuoteValidityUnit;
  defaultQuoteValidityAmount: number | null;
} {
  if (decision.type === 'NEVER') {
    return { defaultQuoteValidityUnit: 'NEVER', defaultQuoteValidityAmount: null };
  }
  return {
    defaultQuoteValidityUnit: decision.term.unit,
    defaultQuoteValidityAmount: decision.term.amount,
  };
}
