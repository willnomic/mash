// Dígito verificador de CNPJ (mod 11) — CLAUDE.md 1.6: regra fiscal não
// se responde de memória, mas o algoritmo do dígito verificador é
// matemática pública, não regra da SEFAZ que muda; testado contra o
// CNPJ real já usado em vários testes do repositório
// ('11444777000161').
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function checkDigit(base: string, weights: number[]): number {
  const sum = base
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return false;
  // Todos os dígitos iguais passa no cálculo do mod 11 mas não é CNPJ
  // real (série de fraudes conhecidas, checagem padrão de mercado).
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const base12 = digits.slice(0, 12);
  const d1 = checkDigit(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(
    base12 + String(d1),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return digits === base12 + String(d1) + String(d2);
}
