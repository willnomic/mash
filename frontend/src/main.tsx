import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import './index.css'
import { router } from './router.tsx'
import { setUnauthorizedHandler } from './lib/api-client.ts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Falha de rede genuína ainda vale retry; erro HTTP (4xx/401/403)
      // não muda tentando de novo (item 5/8).
      retry: (failureCount, error) =>
        !(error instanceof Error && error.name === 'ApiRequestError') &&
        failureCount < 2,
    },
  },
})

// 401 em QUALQUER requisição (não só /me) derruba o cache da sessão e
// manda pro login — item 5, "401 redireciona pro login" é regra do
// cliente HTTP inteiro, não só da leitura inicial.
setUnauthorizedHandler(() => {
  queryClient.setQueryData(['me'], undefined)
  void router.navigate({ to: '/login' })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
