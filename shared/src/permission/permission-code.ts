// Vocabulário compartilhado das permissões (unidade "papéis e
// permissões") — backend usa pra tipar `@RequirePermission(code)`,
// frontend usa pra decidir o que a casca esconde (`/me` devolve as
// permissões efetivas nestes mesmos códigos). Uma lista só, os dois
// lados: sem isso, um typo no código do backend e no componente do
// frontend nunca se cruzam pra dar erro de tipo.
//
// Só as que correspondem a um endpoint que EXISTE hoje — derivado do
// que o sistema já faz: cotação (ver/criar/fechar/aceitar/recusar),
// cadastro de parte e filial (ver/criar, tratados juntos — "partes e
// filiais" é um domínio só no pedido, não dois), e configuração do
// tenant (ver/alterar — sem tela ainda, mas a próxima unidade precisa
// que a permissão já exista pra nascer protegida).
export const PERMISSION_CODES = [
  'quote.view',
  'quote.create',
  'quote.close',
  'quote.accept',
  'quote.reject',
  'registration.view',
  'registration.create',
  'settings.view',
  'settings.change',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];
