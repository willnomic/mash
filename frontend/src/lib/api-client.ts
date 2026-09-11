// Cliente HTTP num módulo só (D-048, item 8): anexa credencial de
// cookie, trata 401, normaliza erro POR CAMPO. fetch puro, sem axios.
//
// FORMATO DO ERRO — definido aqui, o backend se adapta depois:
//
//   { kind: 'validation', fieldErrors: { campo: ['mensagem'] }, formErrors: ['mensagem'] }
//   { kind: 'http', status: number, message: string }
//
// Hoje o backend NÃO emite as duas formas de maneira uniforme — só
// AuthController.login() foi verificado (lido o código-fonte de
// HttpException.getResponse() em @nestjs/common, não suposto):
//   - erro de validação (400, BadRequestException(zod.flatten())):
//     corpo é EXATAMENTE `{ fieldErrors, formErrors }`, sem envelope
//     nenhum (Nest devolve o objeto passado ao construtor tal como é).
//   - qualquer outro erro HTTP (401 credenciais inválidas, etc.): corpo
//     no formato padrão do Nest, `{ statusCode, message, error }`.
// O normalizador abaixo lê as duas formas reais de hoje e produz sempre
// o formato único acima — é aqui que a adaptação futura do backend
// simplificaria (não muda o contrato do lado do frontend).
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type ApiFieldErrors = Record<string, string[]>

export type ApiError =
  | { kind: 'validation'; fieldErrors: ApiFieldErrors; formErrors: string[] }
  | { kind: 'http'; status: number; message: string }

export class ApiRequestError extends Error {
  readonly error: ApiError

  constructor(error: ApiError) {
    super(error.kind === 'validation' ? 'Erro de validação' : error.message)
    this.error = error
  }
}

// A 401 é global (sessão caiu) — quem monta o app registra o que fazer
// (redirecionar pro login), o cliente não conhece o roteador.
type UnauthorizedListener = () => void
let onUnauthorized: UnauthorizedListener | null = null
export function setUnauthorizedHandler(handler: UnauthorizedListener | null) {
  onUnauthorized = handler
}

function isFieldErrorsShape(
  body: unknown,
): body is { fieldErrors: ApiFieldErrors; formErrors?: string[] } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'fieldErrors' in body &&
    typeof (body as Record<string, unknown>).fieldErrors === 'object'
  )
}

async function parseErrorBody(response: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // corpo vazio ou não-JSON — cai no fallback genérico abaixo.
  }

  if (isFieldErrorsShape(body)) {
    return {
      kind: 'validation',
      fieldErrors: body.fieldErrors,
      formErrors: body.formErrors ?? [],
    }
  }

  const message =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Record<string, unknown>).message === 'string'
      ? ((body as Record<string, unknown>).message as string)
      : response.statusText || 'Erro inesperado'

  return { kind: 'http', status: response.status, message }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    // Sessão por cookie httpOnly (D-048) — o frontend nunca guarda nem
    // anexa token manualmente, só isto.
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (response.status === 401) {
    onUnauthorized?.()
    throw new ApiRequestError({
      kind: 'http',
      status: 401,
      message: 'Sessão expirada',
    })
  }

  if (!response.ok) {
    throw new ApiRequestError(await parseErrorBody(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
}
