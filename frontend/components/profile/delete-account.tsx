'use client'

import { Loader2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage, userService } from '@/lib/services'
import type { User } from '@/lib/types'

const CONFIRM_WORD = 'ELIMINAR'

export function DeleteAccount({ user }: { user: User }) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)

  async function onDelete() {
    setPending(true)
    try {
      await userService.deleteAccount(user)
      router.replace('/ingresar')
      await mutate('session')
      toast.success('Tu cuenta y tus datos fueron eliminados.')
    } catch (err) {
      toast.error(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && setConfirm('')}>
      <AlertDialogTrigger
        render={<Button variant="ghost" className="h-12 text-base text-destructive hover:bg-destructive/10 hover:text-destructive" />}
      >
        <Trash2 aria-hidden="true" />
        Eliminar mi cuenta y mis datos
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar tu cuenta?</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            <div className="flex flex-col gap-2 text-left text-sm leading-relaxed">
              <p>Esta acción no se puede deshacer. Se borrarán:</p>
              <ul className="list-disc pl-5">
                <li>Tu perfil y foto</li>
                <li>Tus horarios de clase</li>
                <li>Tus solicitudes y registros de estacionamiento</li>
              </ul>
              <p>Los viajes que publicaste y siguen activos se cancelarán.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-delete">
            Escribe <span className="font-mono font-semibold">{CONFIRM_WORD}</span> para confirmar
          </Label>
          <Input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="h-12 text-base md:text-base" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-12">Cancelar</AlertDialogCancel>
          <Button variant="destructive" className="h-12" disabled={confirm.trim().toUpperCase() !== CONFIRM_WORD || pending} onClick={onDelete}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Eliminar definitivamente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
