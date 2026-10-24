'use client'

import { Loader2, MailCheck } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'
import { Button } from '@/components/ui/button'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { authService, errorMessage } from '@/lib/services'
import { takePendingCredentials } from './pending-credentials'

export function VerifyCodeForm() {
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') ?? ''
  const { mutate } = useSWRConfig()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function submit(value: string) {
    setError(undefined)
    setPending(true)
    try {
      await authService.confirmSignUp(email, value)
      const password = takePendingCredentials(email)
      if (!password) {
        toast.success('¡Cuenta verificada! Ingresa con tu contraseña.')
        router.replace('/ingresar')
        return
      }
      const { isSignedIn } = await authService.signIn(email, password)
      if (!isSignedIn) {
        router.replace('/ingresar')
        return
      }
      await mutate('session')
      toast.success('¡Cuenta verificada! Bienvenido a Aventón Mayab.')
      router.replace('/inicio')
    } catch (err) {
      setError(errorMessage(err))
      setPending(false)
    }
  }

  async function resend() {
    try {
      await authService.resendCode(email)
      toast.success('Te enviamos un nuevo código.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <MailCheck className="size-6" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">Verifica tu correo</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Escribe el código de 6 dígitos que enviamos a <span className="font-medium text-foreground">{email || 'tu correo'}</span>.
        </p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length === 6) submit(code)
        }}
      >
        <InputOTP
          maxLength={6}
          value={code}
          onChange={setCode}
          onComplete={submit}
          inputMode="numeric"
          aria-label="Código de verificación"
          containerClassName="justify-center"
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, i) => (
              <InputOTPSlot key={i} index={i} className="size-12 text-lg" />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error && (
          <p className="text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="h-12 text-base" disabled={pending || code.length < 6}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Verificar
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={resend}>
          Reenviar código
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        ¿No te llegó? Revisa tu carpeta de spam o solicita un código nuevo.
      </p>
    </div>
  )
}
