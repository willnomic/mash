import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Banco de TESTE, nunca o de desenvolvimento (unidade "separar o
    // banco de teste do de desenvolvimento") — este setup recusa a
    // suíte inteira se .env.test não existir ou apontar pro mesmo banco
    // do .env, em vez do dotenv/config padrão (que carregaria .env).
    setupFiles: ['./test/setup-e2e-env.ts'],
    // Os specs compartilham um Postgres real (não mock). Truncate de um
    // arquivo apaga o dado que outro acabou de semear se rodarem em
    // paralelo — precisam ser sequenciais.
    fileParallelism: false,
  },
});
