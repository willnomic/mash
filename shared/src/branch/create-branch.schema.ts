import { z } from 'zod';

// Branch não é Party (tabela própria) — só name é obrigatório além do
// que o backend preenche (id/tenantId). Mesmo tratamento do modal de
// Party (unidade "criar cliente sem sair do fluxo"), bem mais simples
// porque o schema em si é bem mais simples.
export const createBranchSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da filial'),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
