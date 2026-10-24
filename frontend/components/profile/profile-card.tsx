'use client'

import { Camera, Loader2, Lock, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'
import { ColoniaPicker } from '@/components/shared/colonia-picker'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPhone, normalizePhone } from '@/lib/format'
import { errorMessage, userService } from '@/lib/services'
import type { Colonia, User } from '@/lib/types'

const MAX_PHOTO_BYTES = 1_000_000
const AVATAR_SIZE = 256

export function ProfileCard({ user }: { user: User }) {
  const { mutate } = useSWRConfig()
  const [fullName, setFullName] = useState(user.fullName)
  const [phone, setPhone] = useState(user.phone ? formatPhone(user.phone) : '')
  const [colonia, setColonia] = useState<Colonia | undefined>(user.colonia)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const phoneDigits = normalizePhone(phone)
  const dirty = fullName.trim() !== user.fullName || colonia !== user.colonia || phoneDigits !== (user.phone ?? null)

  async function update(patch: Parameters<typeof userService.updateProfile>[1], success: string) {
    setSaving(true)
    try {
      await userService.updateProfile(user, patch)
      await mutate('session')
      toast.success(success)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Elige una imagen.')
    if (file.size > MAX_PHOTO_BYTES) return toast.error('La foto debe pesar menos de 1 MB.')
    const reader = new FileReader()
    reader.onload = () => {
      // Shrink to an avatar-sized JPEG so it fits in the profile record.
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, AVATAR_SIZE / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        update({ photoUrl: canvas.toDataURL('image/jpeg', 0.85) }, 'Foto actualizada.')
      }
      img.onerror = () => toast.error('No pudimos leer esa imagen.')
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <section aria-label="Datos personales" className="flex flex-col gap-5 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-4">
        <UserAvatar name={user.fullName} photoUrl={user.photoUrl} className="size-16 text-lg" />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">Foto opcional</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={saving}>
              <Camera aria-hidden="true" />
              {user.photoUrl ? 'Cambiar' : 'Subir foto'}
            </Button>
            {user.photoUrl && (
              <Button size="sm" variant="ghost" onClick={() => update({ photoUrl: null }, 'Foto eliminada.')} disabled={saving}>
                <Trash2 aria-hidden="true" />
                <span className="sr-only">Quitar foto</span>
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPhoto} />
        </div>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!phoneDigits) return toast.error('Escribe tu celular a 10 dígitos.')
          update({ fullName: fullName.trim(), phone: phoneDigits, colonia }, 'Perfil actualizado.')
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className="h-12 text-base md:text-base" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Correo institucional</Label>
          <div className="relative">
            <Input id="email" value={user.email} readOnly aria-readonly="true" className="h-12 bg-muted pr-10 text-base text-muted-foreground md:text-base" />
            <Lock className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Celular</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="999 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-describedby="phone-hint"
            className="h-12 text-base md:text-base"
          />
          <p id="phone-hint" className={user.phone ? 'text-xs text-muted-foreground' : 'text-sm text-primary'}>
            {user.phone ? 'Solo lo ve quien tenga un viaje aceptado contigo, mientras el viaje está activo.' : 'Agrega tu celular para completar tu perfil.'}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="colonia">Colonia</Label>
          <ColoniaPicker id="colonia" value={colonia} onChange={setColonia} />
          <p className="text-xs text-muted-foreground">Solo guardamos tu colonia, nunca tu dirección.</p>
        </div>
        {dirty && (
          <Button type="submit" className="h-12 text-base" disabled={saving || !colonia}>
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            Guardar cambios
          </Button>
        )}
      </form>
    </section>
  )
}
