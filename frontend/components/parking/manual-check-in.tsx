'use client'

import { Loader2, LogIn, LogOut } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'
import { DataBadge } from '@/components/shared/data-badge'
import { Button } from '@/components/ui/button'
import { useMyParkingEntry, useNow } from '@/hooks/use-data'
import { getZone } from '@/lib/config'
import { formatRelative } from '@/lib/format'
import { errorMessage, parkingService } from '@/lib/services'
import type { User, ZoneId } from '@/lib/types'

export function ManualCheckIn({ user, zoneId, canEnter = true }: { user: User; zoneId: ZoneId; canEnter?: boolean }) {
  const { data: entry, isLoading, error, mutate: refreshEntry } = useMyParkingEntry(user)
  const { mutate } = useSWRConfig()
  const now = useNow()
  const [pending, setPending] = useState<'in' | 'out' | null>(null)
  const zone = getZone(zoneId)

  async function act(kind: 'in' | 'out') {
    setPending(kind)
    try {
      if (kind === 'in') {
        await parkingService.checkIn(user, zoneId)
        toast.success(`Entrada registrada en ${zone.name}.`)
      } else {
        await parkingService.checkOut(user)
        toast.success('Salida registrada.')
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      // Refresh even after a conflict or lost response: the server may have
      // committed the transaction, and another browser can change the session.
      await Promise.allSettled([
        mutate(['parking', 'zones', user.id]),
        mutate(['parking', 'my-entry', user.id]),
      ])
      setPending(null)
    }
  }

  return (
    <section aria-labelledby="manual" className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="manual" className="font-semibold">
          Registro manual
        </h2>
        <DataBadge source="registrado" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Tu entrada y salida actualizan el conteo compartido en el servidor. Solo tú puedes consultar tu sesión; el resto ve totales por zona.
      </p>
      {entry && (
        <p className="rounded-xl bg-primary/8 p-3 text-sm">
          Estás en <span className="font-semibold">{entry.zoneName ?? entry.zoneId}</span> · entrada {formatRelative(entry.timestamp, now)}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-12 text-base" disabled={isLoading || !!error || !canEnter || !!entry || !!pending} onClick={() => act('in')}>
          {pending === 'in' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
          Registrar entrada
        </Button>
        <Button variant="outline" className="h-12 text-base" disabled={!!error || !entry || !!pending} onClick={() => act('out')}>
          {pending === 'out' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          Registrar salida
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">{errorMessage(error)} <button type="button" className="underline" onClick={() => refreshEntry()}>Reintentar consulta de sesión</button></p>
      ) : !entry && <p className="text-xs text-muted-foreground">La entrada se registrará en {zone.name}.</p>}
    </section>
  )
}
