// Extraído de quote-detail.tsx (unidade "lista de cotações" — segundo
// uso, D-021/3.2 antirredundância). timeZone: 'UTC' porque validUntil e
// createdAt chegam como string ISO e as datas de calendário (validUntil,
// D-046) são gravadas em UTC sem componente de hora — formatar em
// horário local converteria a data errado perto da virada do dia.
export function formatDate(value: string | null): string | null {
  if (!value) return null
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}
