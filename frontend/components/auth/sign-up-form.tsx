'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ColoniaPicker } from '@/components/shared/colonia-picker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/config'
import { normalizePhone } from '@/lib/format'
import { authService, errorMessage, isInstitutionalEmail, userService } from '@/lib/services'
import type { Colonia } from '@/lib/types'
import { FormField } from './form-field'
import { setPendingCredentials } from './pending-credentials'

type Errors = Partial<Record<'fullName' | 'email' | 'phone' | 'password' | 'colonia' | 'privacy' | 'form', string>>

export function SignUpForm() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [colonia, setColonia] = useState<Colonia>()
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)

  function validate(): Errors {
    const next: Errors = {}
    if (fullName.trim().length < 3) next.fullName = 'Escribe tu nombre completo.'
    if (!isInstitutionalEmail(email)) next.email = `Solo se permiten correos ${ALLOWED_EMAIL_DOMAIN}`
    if (!normalizePhone(phone)) next.phone = 'Escribe tu celular a 10 dígitos.'
    if (password.length < 8) next.password = 'La contraseña debe tener al menos 8 caracteres.'
    if (!colonia) next.colonia = 'Elige tu colonia aproximada.'
    if (!accepted) next.privacy = 'Debes aceptar el Aviso de privacidad para continuar.'
    return next
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0 || !colonia) return
    setPending(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      await authService.signUp(normalizedEmail, password)
      userService.savePendingProfile(normalizedEmail, { fullName, phone, colonia })
      setPendingCredentials(normalizedEmail, password)
      router.push(`/verificar?email=${encodeURIComponent(normalizedEmail)}`)
    } catch (err) {
      setErrors({ form: errorMessage(err) })
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">Crea tu cuenta</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Solo pedimos tu colonia aproximada, nunca tu domicilio.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <FormField
          id="fullName"
          label="Nombre completo"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          required
        />
        <FormField
          id="email"
          label="Correo institucional"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={`nombre.apellido${ALLOWED_EMAIL_DOMAIN}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
        />
        <FormField
          id="phone"
          label="Celular"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="999 123 4567"
          hint="10 dígitos. Solo lo ve quien tenga un viaje aceptado contigo."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          required
        />
        <FormField
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          hint="Mínimo 8 caracteres."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          required
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="colonia">Colonia aproximada</Label>
          <ColoniaPicker id="colonia" value={colonia} onChange={setColonia} />
          {errors.colonia && (
            <p className="text-sm text-destructive" role="alert">
              {errors.colonia}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="privacy"
              checked={accepted}
              onCheckedChange={(v) => setAccepted(Boolean(v))}
              className="mt-0.5 size-5"
              aria-invalid={errors.privacy ? true : undefined}
            />
            <Label htmlFor="privacy" className="block text-sm leading-relaxed font-normal">
              He leído y acepto el{' '}
              <Link href="/aviso-de-privacidad" className="font-medium text-primary underline underline-offset-4">
                Aviso de privacidad
              </Link>
              .
            </Label>
          </div>
          {errors.privacy && (
            <p className="text-sm text-destructive" role="alert">
              {errors.privacy}
            </p>
          )}
        </div>

        {errors.form && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {errors.form}
          </p>
        )}

        <Button type="submit" className="h-12 text-base" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Crear cuenta
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link href="/ingresar" className="font-medium text-primary underline-offset-4 hover:underline">
          Ingresa
        </Link>
      </p>
    </div>
  )
}
