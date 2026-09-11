import { z } from 'zod';

// Schema de contrato (D-048): backend valida no DTO, frontend valida no
// formulário — uma definição, as duas bordas. Movido de
// backend/src/auth/login.schema.ts (unidade "a casca do frontend"), o
// frontend agora existe e é o segundo uso real que a D-021 previu.
export const loginSchema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
