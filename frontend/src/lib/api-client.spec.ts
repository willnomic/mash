import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiRequestError, setUnauthorizedHandler } from './api-client'

// Mínimo pedido (item 8/verificação): prova que 401 dispara o
// tratamento central — não infraestrutura de teste elaborada (sem MSW),
// só mock direto de fetch, que é o único I/O deste módulo.
describe('api-client', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    setUnauthorizedHandler(null)
    vi.restoreAllMocks()
  })

  it('401 chama o handler registrado e rejeita com ApiRequestError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 401 }),
    )
    const handler = vi.fn()
    setUnauthorizedHandler(handler)

    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiRequestError)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('erro de validação (fieldErrors) chega normalizado por campo', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          fieldErrors: { email: ['E-mail inválido'] },
          formErrors: [],
        }),
        { status: 400 },
      ),
    )

    try {
      await api.post('/auth/login', { slug: 'a', email: 'x', password: 'y' })
      expect.unreachable('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError)
      const apiError = (error as ApiRequestError).error
      expect(apiError.kind).toBe('validation')
      if (apiError.kind === 'validation') {
        expect(apiError.fieldErrors.email).toEqual(['E-mail inválido'])
      }
    }
  })
})

describe('beforeEach reset', () => {
  beforeEach(() => {
    setUnauthorizedHandler(null)
  })
  it('sem handler registrado, 401 não quebra (no-op seguro)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiRequestError)
  })
})
