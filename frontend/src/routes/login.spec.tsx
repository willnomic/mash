import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginPage } from './login'

// Mínimo pedido (verificação): prova que o formulário de login ENVIA os
// dados certos pro backend — não testa navegação real (o roteador é
// mockado) nem estilo visual.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

function renderLogin() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    cleanup()
    vi.restoreAllMocks()
  })

  it('foca o primeiro campo (transportadora) ao montar', () => {
    renderLogin()
    expect(screen.getByLabelText('Transportadora')).toHaveFocus()
  })

  it('envia slug, e-mail e senha pro POST /auth/login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    globalThis.fetch = fetchMock
    const user = userEvent.setup()

    renderLogin()

    await user.type(screen.getByLabelText('Transportadora'), 'transportadora-a')
    await user.type(screen.getByLabelText('E-mail'), 'operador@a.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-forte-123')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/auth/login')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body)).toEqual({
      slug: 'transportadora-a',
      email: 'operador@a.com',
      password: 'senha-forte-123',
    })
  })

  it('não envia com campo obrigatório vazio — valida antes de chamar a API', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    const user = userEvent.setup()

    renderLogin()

    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() =>
      expect(screen.getByLabelText('Transportadora')).toBeInvalid(),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
