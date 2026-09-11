// Unidades federativas do Brasil — geografia fixa por lei, nunca
// configurável por tenant (D-020: "lista fixa por lei ou pelo sistema
// permanece enum"). Única lista no repositório (fonte única de verdade,
// CLAUDE.md 3.2): backend valida `icmsUf` contra ela, frontend povoa o
// seletor com ela — nenhum dos dois reescreve a lista por conta própria.
export const BRAZILIAN_STATE_CODES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export type BrazilianStateCode = (typeof BRAZILIAN_STATE_CODES)[number];
