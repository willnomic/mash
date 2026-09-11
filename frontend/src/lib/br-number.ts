import { Decimal } from 'decimal.js'

// Conversão entre a máscara pt-BR que o operador digita ("2.800,00") e o
// formato canônico do contrato (Decimal em string, "2800.00" — D-013).
// Duas variantes: ESTRITA (usada na validação de envio — dispara erro em
// entrada não numérica) e TOLERANTE (usada só no preview ao vivo, onde
// entrada parcial durante a digitação — "2.", vazio — não pode quebrar o
// cálculo a cada tecla, D-048 item 3).

export function parseBrDecimalToApi(value: string): string {
  const trimmed = value.trim()
  const withoutThousands = trimmed.replace(/\./g, '')
  return withoutThousands.replace(',', '.')
}

// Nunca lança — devolve '0' pra entrada que ainda não é um número
// válido (o preview mostra zero até o operador terminar de digitar, em
// vez de travar ou mostrar erro a cada tecla).
export function parseBrDecimalLenient(value: string): string {
  const parsed = parseBrDecimalToApi(value)
  return /^\d+(\.\d+)?$/.test(parsed) ? parsed : '0'
}

// Decimal → string pt-BR, só para EXIBIÇÃO (D-013: a conversão pra
// number acontece aqui, no último passo — nunca dentro do cálculo).
export function formatDecimalBRL(value: Decimal | string): string {
  return new Decimal(value).toNumber().toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Percentual com até 4 casas (escala de Quote.marginPercentage/TaxRate,
// D-013: numeric(7,4)) — sem casas decimais fixas, corta zero à direita
// (20 fica "20", não "20,0000").
export function formatPercentBRL(value: Decimal | string): string {
  return new Decimal(value).toNumber().toLocaleString('pt-BR', {
    maximumFractionDigits: 4,
  })
}
