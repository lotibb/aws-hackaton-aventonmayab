'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { Button } from '@/components/ui/button'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/config'
import { authService, errorMessage, isInstitutionalEmail } from '@/lib/services'
import { FormField } from './form-field'
import { setPendingCredentials } from './pending-credentials'

export function SignInForm() {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [emailError, setEmailError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (!isInstitutionalEmail(email)) {
      setEmailError(`Usa tu correo institucional que termina en ${ALLOWED_EMAIL_DOMAIN}.`)
      return
    }
    setEmailError(undefined)
    setPending(true)
    try {
      const { isSignedIn, needsConfirmation } = await authService.signIn(email.trim(), password)
      if (needsConfirmation) {
        await authService.resendCode(email.trim())
        setPendingCredentials(email, password)
        router.push(`/verificar?email=${encodeURIComponent(email.trim())}`)
        return
      }
      if (!isSignedIn) throw new Error('No pudimos iniciar sesión. Inténtalo de nuevo.')
      await mutate('session')
      router.replace('/inicio')
    } catch (err) {
      setError(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">Hola de nuevo</h1>
        <p className="mt-2 text-pretty text-muted-foreground">Comparte aventones y encuentra lugar en el campus, sin rastreo.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <FormField
          id="email"
          label="Correo institucional"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={`nombre.apellido${ALLOWED_EMAIL_DOMAIN}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          required
        />
        <FormField
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="h-12 text-base" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Ingresar
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ¿Aún no tienes cuenta?{' '}
        <Link href="/registro" className="font-medium text-primary underline-offset-4 hover:underline">
          Regístrate
        </Link>
      </p>
    </div>
  )
}
