// Extraído de quote-detail.tsx (unidade "lista de cotações" — segundo
// uso, D-021/3.2 antirredundância). Cor de status (D-022): nunca a cor
// de marca — neutro/positivo/negativo são os três tons que os cinco
// estados da cotação usam (Rascunho/Fechada = neutro, Aceita =
// positivo, Recusada/Vencida = negativo).
export type StatusTone = 'neutral' | 'positive' | 'negative'

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  positive: 'text-foreground font-semibold',
  negative: 'text-destructive font-semibold',
}
