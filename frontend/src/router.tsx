import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AppLayout } from '@/layouts/app-layout'
import { LoginPage } from '@/routes/login'
import { HomePage } from '@/routes/home'

// Roteador tipado — TanStack Router, não React Router (D-021/D-048
// deixaram a escolha entre os dois em aberto). Decisão desta unidade:
// mesmo ecossistema do TanStack Query já usado (item 9), e search
// params tipados nativamente — o que "estado de filtro/busca/página vive
// na URL" (item 9) vai precisar quando a primeira tela de listagem
// existir, sem depender de useSearchParams sem tipo do React Router.
//
// Árvore em código, não roteamento por arquivo: só duas rotas nesta
// unidade (login, casca de app com um placeholder dentro) — o plugin de
// roteamento por arquivo seria estrutura pra três telas que ainda não
// existem.
const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

// Rota "casca" sem path próprio (id, não path) — agrupa tudo que precisa
// do AppLayout (sidebar/cabeçalho/sessão) debaixo de um Outlet só.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: HomePage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([homeRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
