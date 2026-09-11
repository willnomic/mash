import { z } from 'zod';
import { isValidCnpj, onlyDigits } from '../brazil/cnpj.js';
import { BRAZILIAN_STATE_CODES } from '../brazil/uf.js';

// Contrato de criação de Party pelo modal (unidade "criar cliente sem
// sair do fluxo") — SEMPRE personType=COMPANY/cnpj (o modal só existe
// pra CNPJ; PF por CPF fica pra tela de cadastro completa, fora de
// escopo). O CHECK do banco (Customer_document_matches_person_type,
// migração 20260904070857) já amarra isso — este schema só valida o
// formato antes de chegar lá.
//
// cnpj aceita string com ou sem pontuação: `.transform(onlyDigits)`
// normaliza ANTES de validar, então o mesmo schema serve pro formulário
// sem precisar de uma camada derivada (D-048 item 1) — não há
// diferença de REPRESENTAÇÃO entre tela e contrato aqui, só a máscara
// visual, que o transform já absorve.
// Exportado (não só interno): a rota de consulta de CNPJ
// (GET /parties/cnpj/:cnpj) valida o parâmetro com o MESMO schema antes
// de gastar a chamada externa — nunca duplicado.
export const cnpjFieldSchema = z
  .string()
  .transform(onlyDigits)
  .pipe(
    z
      .string()
      .regex(/^\d{14}$/, 'CNPJ precisa ter 14 dígitos')
      .refine(isValidCnpj, 'CNPJ inválido (dígito verificador não bate)'),
  );

// Só cria Address se a consulta trouxer o conjunto completo dos campos
// NOT NULL de Address (D-051 investigação: nem Order nem Trip exigem
// endereço pra aceitar a cotação) — nunca parcial, nunca inventado.
export const createPartyAddressSchema = z.object({
  logradouro: z.string().trim().min(1),
  numero: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  complemento: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  bairro: z.string().trim().min(1),
  municipio: z.string().trim().min(1),
  uf: z.enum(BRAZILIAN_STATE_CODES),
  cep: z
    .string()
    .transform(onlyDigits)
    .pipe(z.string().regex(/^\d{8}$/, 'CEP precisa ter 8 dígitos')),
});

export const createPartySchema = z.object({
  name: z.string().trim().min(1, 'Informe a razão social'),
  cnpj: cnpjFieldSchema,
  address: createPartyAddressSchema.optional(),
});

export type CreatePartyAddressInput = z.infer<typeof createPartyAddressSchema>;
export type CreatePartyInput = z.infer<typeof createPartySchema>;
