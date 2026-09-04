import { z } from 'zod';

// Schema único, compartilhado com o front quando ele existir (D-021) — não
// duplicar essa validação em outro lugar.
export const loginSchema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
