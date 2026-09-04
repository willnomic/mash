-- Executado uma vez, na criação do volume do Postgres local. Role é objeto
-- de cluster, não de schema/database — sobrevive a "prisma migrate reset".
--
-- Cria o role de aplicação sem posse de tabela, para que FORCE ROW LEVEL
-- SECURITY se aplique a ele (docs/d012-multi-tenant-rls.md, Passo 1).
--
-- Senha fixa de desenvolvimento local. Nunca usar em produção — lá o role
-- e a senha são criados manualmente na plataforma gerenciada (D-005).
CREATE ROLE mash_app LOGIN PASSWORD 'mash_app_dev_only';

GRANT CONNECT ON DATABASE mash TO mash_app;

-- USAGE no schema e GRANT nas tabelas NÃO entram aqui: "prisma migrate
-- reset" recria o schema public do zero, o que apagaria esses grants
-- silenciosamente. Eles vivem na migração inicial (migration.sql), que
-- roda de novo a cada reset.
