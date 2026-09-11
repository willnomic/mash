import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

// Isolamento do banco de teste (unidade "separar o banco de teste do
// de desenvolvimento") — FALHA FECHADA: sem .env.test com as duas URLs,
// a suíte e2e recusa rodar. NUNCA cai de volta no banco de
// desenvolvimento por padrão, que é exatamente o acidente que esta
// unidade existe pra impedir (TRUNCATE ... "Tenant" CASCADE apagando o
// tenant semeado e as tabelas de domínio compartilhadas).
//
// dotenv.parse() lê o ARQUIVO direto, sem tocar process.env — nenhuma
// ambiguidade com o que o shell já tiver exportado. É a lição do
// achado anterior: NODE_ENV vazio já exportado no shell venceu o .env
// em silêncio porque dotenv/config não sobrescreve variável já
// definida. Aqui a checagem roda sobre o CONTEÚDO DO ARQUIVO, nunca
// sobre process.env — não importa o que o shell já tenha.
const TEST_ENV_PATH = '.env.test';
const DEV_ENV_PATH = '.env';

function fail(message: string): never {
  throw new Error(`Suíte e2e recusada — ${message}`);
}

if (!existsSync(TEST_ENV_PATH)) {
  fail(
    `${TEST_ENV_PATH} não existe. Copie de .env.test.example e rode ` +
      `"npm run db:test:setup" antes de testar. A suíte nunca usa o ` +
      `banco de desenvolvimento por padrão.`,
  );
}

const testEnv = parse(readFileSync(TEST_ENV_PATH));

if (!testEnv.DATABASE_URL || !testEnv.DATABASE_URL_APP) {
  fail(`DATABASE_URL/DATABASE_URL_APP ausentes em ${TEST_ENV_PATH}.`);
}

// Segunda guarda: um .env.test copiado do .env por engano (mesma URL
// do banco de desenvolvimento) precisa ser pego aqui, não só a
// ausência do arquivo.
if (existsSync(DEV_ENV_PATH)) {
  const devEnv = parse(readFileSync(DEV_ENV_PATH));
  if (
    devEnv.DATABASE_URL &&
    devEnv.DATABASE_URL === testEnv.DATABASE_URL
  ) {
    fail(
      `DATABASE_URL em ${TEST_ENV_PATH} é IDÊNTICA à de ${DEV_ENV_PATH} — ` +
        `isso rodaria a suíte contra o banco de desenvolvimento. Aponte ` +
        `${TEST_ENV_PATH} pra um banco de teste separado (ver .env.test.example).`,
    );
  }
  if (
    devEnv.DATABASE_URL_APP &&
    devEnv.DATABASE_URL_APP === testEnv.DATABASE_URL_APP
  ) {
    fail(
      `DATABASE_URL_APP em ${TEST_ENV_PATH} é IDÊNTICA à de ${DEV_ENV_PATH} — ` +
        `isso rodaria a suíte contra o banco de desenvolvimento. Aponte ` +
        `${TEST_ENV_PATH} pra um banco de teste separado (ver .env.test.example).`,
    );
  }
}

// Escreve no processo só depois das duas guardas passarem — de
// propósito, SEMPRE sobrescreve o que já estiver em process.env
// (diferente do dotenv/config padrão): a intenção aqui é o oposto do
// achado anterior — .env.test manda, mesmo que o shell já tenha
// DATABASE_URL de outra coisa.
for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] = value;
}
