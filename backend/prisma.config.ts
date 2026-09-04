import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Usado só pelo Prisma CLI (migrate, studio). Conecta como dono do banco —
// nunca é o que a aplicação usa em runtime (docs/d012-multi-tenant-rls.md).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
