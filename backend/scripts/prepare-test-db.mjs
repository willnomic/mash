#!/usr/bin/env node
// Prepara o banco de TESTE do zero (unidade "separar o banco de teste
// do de desenvolvimento"). Cria "mash_test" no MESMO cluster/roles do
// banco de desenvolvimento — nunca um Postgres separado — e aplica as
// migrações, que já semeiam as tabelas de domínio (D-020/D-041/D-043/
// D-045). Não existe passo de "semente" além disso.
//
// Rodar as MESMAS migrações contra um banco novo é o que garante GRANTs
// e RLS IDÊNTICOS aos do banco de desenvolvimento (ALTER DEFAULT
// PRIVILEGES na primeira migração, docs/d012-multi-tenant-rls.md) — se
// os GRANTs fossem reescritos à mão aqui, os testes que provam garantia
// de banco (D-041/D-046/D-047) passariam a testar outra coisa.
//
// Idempotente: seguro rodar de novo se o banco já existir (não recria,
// só garante GRANT CONNECT e roda as migrações pendentes). Não faz
// DROP/RESET — dado sujo de execução anterior já se resolve pelo
// TRUNCATE + resemeadura que cada arquivo de teste já faz no próprio
// beforeEach (não mudado nesta unidade); "sujo" aqui é só "schema
// ausente ou atrasado".
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from 'dotenv';
import pg from 'pg';

const TEST_ENV_PATH = '.env.test';

if (!existsSync(TEST_ENV_PATH)) {
  console.error(
    `${TEST_ENV_PATH} não existe. Copie de .env.test.example e ajuste antes de preparar o banco de teste.`,
  );
  process.exit(1);
}

// dotenv.parse() lê o ARQUIVO direto — não passa por process.env, então
// não há ambiguidade com o que o shell já tiver exportado (a mesma
// classe de problema que fez NODE_ENV vazio vencer o .env em silêncio).
const testEnv = parse(readFileSync(TEST_ENV_PATH));

if (!testEnv.DATABASE_URL || !testEnv.DATABASE_URL_APP) {
  console.error(`DATABASE_URL/DATABASE_URL_APP ausentes em ${TEST_ENV_PATH}.`);
  process.exit(1);
}

const ownerUrl = new URL(testEnv.DATABASE_URL);
const appUrl = new URL(testEnv.DATABASE_URL_APP);
const testDbName = ownerUrl.pathname.replace(/^\//, '');
const appDbName = appUrl.pathname.replace(/^\//, '');
const appRole = appUrl.username;

if (testDbName !== appDbName) {
  console.error(
    `DATABASE_URL aponta pro banco "${testDbName}" e DATABASE_URL_APP pro banco "${appDbName}" — as duas têm que ser o mesmo banco (${TEST_ENV_PATH}).`,
  );
  process.exit(1);
}

// Conecta na base de manutenção "postgres" do MESMO cluster — nunca no
// banco de teste em si, que ainda pode não existir.
const maintenanceUrl = new URL(ownerUrl);
maintenanceUrl.pathname = '/postgres';

const admin = new pg.Client({ connectionString: maintenanceUrl.toString() });
await admin.connect();

const { rowCount } = await admin.query(
  'SELECT 1 FROM pg_database WHERE datname = $1',
  [testDbName],
);
if (rowCount === 0) {
  // CREATE DATABASE não é DML — não aceita parâmetro vinculado. O nome
  // vem de DATABASE_URL do próprio .env.test (arquivo local, não
  // entrada externa), não é o mesmo risco de injeção do SET LOCAL da
  // D-012.
  await admin.query(`CREATE DATABASE "${testDbName}" OWNER mash_owner`);
  console.log(`Banco "${testDbName}" criado.`);
} else {
  console.log(`Banco "${testDbName}" já existe — não recriado.`);
}
// mash_app é role de CLUSTER (sobrevive a reset, docker/init-db.sql) —
// só falta o CONNECT neste banco específico, mesmo grant que
// docker/init-db.sql já faz pro banco de desenvolvimento.
await admin.query(`GRANT CONNECT ON DATABASE "${testDbName}" TO "${appRole}"`);
await admin.end();

console.log(
  `Aplicando migrações em "${testDbName}" (mesmas do banco de desenvolvimento — GRANTs e RLS idênticos, D-012)...`,
);
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testEnv.DATABASE_URL },
});

console.log(
  'Banco de teste pronto — migrações incluem a semente das tabelas de domínio (D-020/D-041/D-043/D-045).',
);
