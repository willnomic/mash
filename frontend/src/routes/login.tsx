import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { loginSchema, type LoginInput } from '@mash/shared'
import { useLogin } from '@/hooks/use-auth'
import { ApiRequestError } from '@/lib/api-client'
import { AuthLayout } from '@/layouts/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// D-022: teclado é aritmética, não estética. Foco automático no
// primeiro campo, Enter avança (não em qualquer input dentro de um
// <form> submete sozinho — aqui só o ÚLTIMO campo deixa isso
// acontecer), autocomplete correto pro gerenciador de senha do
// navegador reconhecer login+senha.
export function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const slugRef = useRef<HTMLInputElement | null>(null)
  const emailRef = useRef<HTMLInputElement | null>(null)
  const passwordRef = useRef<HTMLInputElement | null>(null)

  const slugField = register('slug')
  const emailField = register('email')
  const passwordField = register('password')

  useEffect(() => {
    slugRef.current?.focus()
  }, [])

  function handleSlugKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      emailRef.current?.focus()
    }
  }

  function handleEmailKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      passwordRef.current?.focus()
    }
  }

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null)
    try {
      await login.mutateAsync(input)
      await navigate({ to: '/' })
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.error.kind === 'validation') {
          for (const [field, messages] of Object.entries(
            error.error.fieldErrors,
          )) {
            setError(field as keyof LoginInput, {
              message: messages[0],
            })
          }
          if (error.error.formErrors[0]) {
            setFormError(error.error.formErrors[0])
          }
        } else {
          setFormError(error.error.message)
        }
        return
      }
      setFormError('Não foi possível entrar. Tente novamente.')
    }
  })

  const busy = isSubmitting || login.isPending

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <h1 className="text-base font-semibold text-foreground">Entrar</h1>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">Transportadora</Label>
          <Input
            id="slug"
            autoComplete="organization"
            aria-invalid={Boolean(errors.slug)}
            onKeyDown={handleSlugKeyDown}
            {...slugField}
            ref={(el) => {
              slugField.ref(el)
              slugRef.current = el
            }}
          />
          {errors.slug && (
            <p className="text-xs text-destructive">{errors.slug.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            aria-invalid={Boolean(errors.email)}
            onKeyDown={handleEmailKeyDown}
            {...emailField}
            ref={(el) => {
              emailField.ref(el)
              emailRef.current = el
            }}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...passwordField}
            ref={(el) => {
              passwordField.ref(el)
              passwordRef.current = el
            }}
          />
          {errors.password && (
            <p className="text-xs text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={busy} className="mt-1">
          {busy ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  )
}
