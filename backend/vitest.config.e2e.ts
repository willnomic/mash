import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['dotenv/config'],
    // Os specs compartilham um Postgres real (não mock). Truncate de um
    // arquivo apaga o dado que outro acabou de semear se rodarem em
    // paralelo — precisam ser sequenciais.
    fileParallelism: false,
  },
});
