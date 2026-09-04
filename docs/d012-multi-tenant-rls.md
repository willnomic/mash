# D-012 · Multi-tenant com Row-Level Security

Implementação de referência. Decisão registrada em `decisoes.md`.

---

## O princípio

Sem RLS, o isolamento entre clientes depende da aplicação lembrar de filtrar por
`tenantId` em toda consulta. Uma omissão — uma — e a transportadora A vê a tabela de
preço da B.

Com RLS, a sessão declara quem é o tenant e o **banco** recusa linhas dos demais. Não
importa o que a aplicação peça, se há SQL cru, ou se a IA gerou uma consulta sem o
filtro.

Troca *"eu preciso nunca errar"* por *"errar não causa dano"*.

---

## As três armadilhas

Todas falham **em silêncio**: o sistema funciona, os testes passam, e não há
isolamento nenhum.

### 1. O dono da tabela ignora RLS

Por padrão o PostgreSQL não aplica política ao dono da tabela, e nunca a um superuser.
O Prisma roda migrações como dono. Se a aplicação usar a mesma credencial — o padrão
de todo tutorial — as políticas não fazem nada.

**Defesa dupla:** `FORCE ROW LEVEL SECURITY` em cada tabela **e** um usuário de banco
separado para a aplicação, sem posse de nada.

### 2. O pool de conexões vaza tenant

`SET` em nível de sessão persiste na conexão. A requisição termina, a conexão volta ao
pool ainda carregando o valor, e a próxima requisição — de outro cliente — herda.
Intermitente, dependente de concorrência, não reproduz em desenvolvimento.

**Defesa:** `SET LOCAL` (ou `set_config(..., TRUE)`), que é escopado à transação e se
desfaz sozinho no commit ou rollback. Toda operação que toca dado roda dentro de
transação.

Bônus: `SET LOCAL` é compatível com PgBouncer em modo transaction, `SET` de sessão não é.

### 3. `USING` não protege escrita

`USING` controla o que se enxerga. Sem `WITH CHECK`, nada impede gravar registro com o
`tenantId` de outra empresa. Protegido na leitura, furado na escrita.

**Defesa:** toda política tem as duas cláusulas.

---

## Implementação

### Passo 1 — Dois usuários de banco

O Prisma migra como dono; a aplicação conecta como usuário sem posse.

```sql
CREATE ROLE mash_app LOGIN PASSWORD '...';

GRANT CONNECT ON DATABASE mash TO mash_app;
GRANT USAGE ON SCHEMA public TO mash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mash_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mash_app;

-- para que tabelas futuras já nasçam acessíveis
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mash_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mash_app;
```

Duas variáveis de ambiente:

```
DATABASE_URL=postgresql://owner:...@host/mash        # migrações, apenas CLI
DATABASE_URL_APP=postgresql://mash_app:...@host/mash # runtime
```

> Em Railway/Render a credencial entregue costuma ser a de dono. Criar o segundo role
> é passo manual, feito uma vez.

**Armadilha verificada em dev local:** `prisma migrate reset` recria o schema
`public` do zero (`DROP SCHEMA` + `CREATE SCHEMA`) a cada execução. `CREATE ROLE` é
objeto de cluster e sobrevive; `GRANT ... ON SCHEMA public` e `GRANT ... ON ALL TABLES
IN SCHEMA public` **não sobrevivem** — são apagados junto com o schema antigo. Rodar o
bloco de `GRANT` só no script de init do container (uma vez, na criação do volume)
deixa `mash_app` sem permissão depois do primeiro `migrate reset`, e a app quebra com
`permission denied for schema public` — sintoma que não tem nada a ver com RLS, mas se
parece com ele. Solução: manter `CREATE ROLE` no script de init (roda uma vez), e
colocar `GRANT` + `ALTER DEFAULT PRIVILEGES` dentro da própria migração inicial (roda
de novo a cada reset).

### Passo 2 — Política por tabela

O Prisma não gerencia RLS no `schema.prisma`. Use migração SQL:
`npx prisma migrate dev --create-only`, depois edite o arquivo gerado.

```sql
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Order"
  USING      ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('app.current_tenant_id', TRUE), '')::uuid);
```

O `TRUE` em `current_setting` significa "não estoure se a variável não existir" —
retorna `NULL` **na primeira vez, numa conexão nova**. E `"tenantId" = NULL` resulta em
`NULL`, que não é verdadeiro, então **nenhuma linha aparece**. Esquecer de definir o
tenant falha fechado, não aberto. É a propriedade mais importante do desenho.

**Armadilha verificada em conexão de pool (Postgres 17):** depois que
`set_config(..., TRUE)` roda pelo menos uma vez numa conexão e a transação faz commit,
`current_setting` **não volta a `NULL`** — volta a `''` (string vazia), porque o GUC
customizado já existe como placeholder na sessão. Um cast direto `''::uuid` estoura
erro em vez de devolver zero linhas. Com pool de conexão (qualquer app real em
produção), isso acontece o tempo todo, não é caso de borda. `nullif(valor, '')` resolve:
transforma `''` de volta em `NULL` antes do cast, então o resultado continua "falha
fechado, zero linhas" — sem exceção. Sempre usar essa forma, nunca o cast direto.

### Passo 3 — Cliente Prisma por tenant

```ts
// prisma-tenant.ts
import { PrismaClient } from '@prisma/client'

const base = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_APP } },
})

export function forTenant(tenantId: string) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ])
          return result
        },
      },
      // $allModels/$allOperations só cobre operação de modelo (create,
      // findMany...). $queryRaw e $executeRaw são chamada de nível de
      // cliente e passam por fora desse gancho — cada um precisa do
      // próprio, senão consulta crua sai sem o tenant definido.
      async $queryRaw({ args, query }) {
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
          query(args),
        ])
        return result
      },
      async $executeRaw({ args, query }) {
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
          query(args),
        ])
        return result
      },
    },
  })
}
```

**Detalhe que não é opcional:** use `set_config` com parâmetro vinculado, não
`SET LOCAL app.current_tenant_id = ${tenantId}`. `SET LOCAL` não aceita bind
parameter, então a interpolação viraria concatenação de string — injeção de SQL na
única camada que deveria ser inviolável.

Para operações de negócio com vários passos que precisam ser atômicos, use transação
interativa e defina a variável uma vez:

```ts
await base.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`
  const order = await tx.order.create({ data: {...} })
  await tx.invoice.create({ data: { orderId: order.id, ... } })
})
```

### Passo 4 — Wiring no NestJS

Use `AsyncLocalStorage`, **não** providers com escopo `REQUEST`. Escopo de requisição
contamina toda a cadeia de dependências acima dele e degrada o desempenho da
aplicação inteira.

```ts
// tenant.middleware.ts
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const tenantId = req.user?.tenantId          // vem do JWT, validado no guard
    if (!tenantId) throw new UnauthorizedException()
    this.cls.set('tenantId', tenantId)
    next()
  }
}
```

```ts
// tenant-prisma.service.ts
@Injectable()
export class TenantPrisma {
  constructor(private readonly cls: ClsService) {}

  get db() {
    const tenantId = this.cls.get('tenantId')
    if (!tenantId) throw new InternalServerErrorException('tenant ausente no contexto')
    return forTenant(tenantId)
  }
}
```

Serviços injetam `TenantPrisma` e usam `this.tenantPrisma.db.order.findMany()`. O
`tenantId` nunca aparece no código de negócio — é isso que impede o esquecimento.

**O `tenantId` vem sempre do token, nunca de parâmetro de requisição.** Se vier do
corpo, da query string ou de um header, o cliente escolhe qual tenant quer ler.

---

## Os testes

Sem estes, a decisão não está implementada — está apenas escrita.

Rodam contra PostgreSQL real, conectados como `mash_app`. Não use SQLite nem mock:
RLS é do banco, e um mock testaria exatamente a camada que não importa.

### Teste 1 — Isolamento

```ts
it('não enxerga dado de outro tenant', async () => {
  await seed(tenantA, { orders: 3 })
  await seed(tenantB, { orders: 5 })

  const orders = await forTenant(tenantA).order.findMany()

  expect(orders).toHaveLength(3)
  expect(orders.every(o => o.tenantId === tenantA)).toBe(true)
})
```

### Teste 2 — Falha fechada

```ts
it('sem tenant definido, não retorna nada', async () => {
  await seed(tenantA, { orders: 3 })

  const orders = await base.order.findMany()   // cliente cru, sem extensão

  expect(orders).toHaveLength(0)
})
```

Este é o mais importante. Prova que o padrão de falha é "não vê nada", não "vê tudo".

### Teste 3 — SQL cru

```ts
it('protege também consulta crua', async () => {
  await seed(tenantB, { orders: 5 })

  const rows = await forTenant(tenantA).$queryRaw`SELECT * FROM "Order"`

  expect(rows).toHaveLength(0)
})
```

É o teste que justifica a escolha do RLS sobre o filtro na aplicação. Um `WHERE`
escrito à mão não teria essa proteção.

### Teste 4 — Escrita cruzada

```ts
it('impede gravar no tenant alheio', async () => {
  await expect(
    forTenant(tenantA).order.create({ data: { tenantId: tenantB, ... } })
  ).rejects.toThrow()
})
```

### Teste 5 — Guarda contra tabela desprotegida

Este roda sobre o schema, não sobre dados. Detecta a falha mais provável no dia a dia:
criar uma tabela nova e esquecer a política.

```ts
it('toda tabela com tenantId tem RLS forçado', async () => {
  const unprotected = await base.$queryRaw<{ relname: string }[]>`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenantId'
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  `
  expect(unprotected).toEqual([])
})
```

Custa dez minutos e vale mais que os outros quatro somados ao longo do projeto, porque
o erro que ele pega é o único que se repete a cada nova tabela — dezenas de vezes ao
longo de um ano, sempre com pressa.

---

## Índices

O predicado de RLS entra em toda consulta. `tenantId` precisa de índice, e os índices
compostos devem **começar** por ele:

```prisma
@@index([tenantId, status, createdAt])
```

A ordem importa: um índice em `[status, tenantId]` é muito menos útil, porque o banco
não consegue usar o prefixo para restringir ao tenant primeiro.

---

## O que o RLS não faz

- **Não protege embarcador X de embarcador Y** (ver D-010). Ambos vivem no mesmo
  tenant. Isso exige uma segunda camada de autorização, na aplicação, com o mesmo
  rigor.
- **Não substitui controle de papel** (ver D-009). Tenant define quais dados existem;
  papel define o que se pode fazer com eles. Nunca misturar as duas lógicas numa
  consulta.
- **Não cobre tabela sem política.** Daí o teste 5.
- **Não protege contra bug de lógica de negócio** dentro do tenant correto.

---

## Ordem de execução

1. Criar o role `mash_app` e as duas variáveis de ambiente
2. Migração da primeira tabela já com `ENABLE` + `FORCE` + política com `WITH CHECK`
3. `forTenant()` e o wiring com AsyncLocalStorage
4. **Os cinco testes, antes da segunda tabela**
5. Só então seguir com o modelo de dados

O passo 4 antes do 5 não é preciosismo. Depois de vinte tabelas, verificar isolamento
vira projeto; agora é uma tarde.
