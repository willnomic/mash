import { z } from 'zod';
import { quoteValidityDecisionSchema } from '../quote/close-quote.schema.js';

// Configuração do tenant (unidade "configuração do tenant — prazo
// padrão de validade da cotação") — primeira configuração real do
// produto, estrutura pensada pra outras virem depois (não construídas
// aqui). Um campo só: defaultQuoteValidity, mesmo shape de
// QuoteValidityDecision usado em closeQuoteSchema — "quanto tempo uma
// cotação vale, ou nunca vence" é a mesma pergunta nos dois lugares.
//
// Sem valor "não configurado" AQUI: este schema valida o corpo de
// PUT /tenant-settings, que só existe quando o gestor está DECIDINDO
// algo (TERM ou NEVER). "Ninguém decidiu ainda" é representado pela
// AUSÊNCIA da linha no banco (TenantSettingsService), nunca por um
// terceiro valor deste schema — mesmo critério de D-052: "não invente
// valor padrão, não preencha com vazio".
export const updateTenantSettingsSchema = z.object({
  defaultQuoteValidity: quoteValidityDecisionSchema,
});

export type UpdateTenantSettingsInput = z.infer<
  typeof updateTenantSettingsSchema
>;
