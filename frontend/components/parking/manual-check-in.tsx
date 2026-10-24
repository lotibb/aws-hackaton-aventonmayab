'use client'

import { Loader2, LogIn, LogOut } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DataBadge } from '@/components/shared/data-badge'
import { Button } from '@/components/ui/button'
import { useMyParkingEntry, useNow } from '@/hooks/use-data'
import { getZone } from '@/lib/config'
import { formatRelative } from '@/lib/format'
import { errorMessage, parkingService } from '@/lib/services'
import type { User, ZoneId } from '@/lib/types'

export function ManualCheckIn({ user, zoneId }: { user: User; zoneId: ZoneId }) {
  const { data: entry, isLoading } = useMyParkingEntry(user)
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
      setPending(null)
    }
  }

  return (
    <section aria-labelledby="manual" className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="manual" className="font-semibold">
          Registro manual
        </h2>
        <DataBadge source="estimado" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        En esta demo, registrar entrada suma un auto y registrar salida lo resta de tu zona. El ajuste visual se guarda en este navegador; nadie más ve en qué zona estás.
      </p>
      {entry && (
        <p className="rounded-xl bg-primary/8 p-3 text-sm">
          Estás en <span className="font-semibold">{getZone(entry.zoneId).name}</span> · entrada {formatRelative(entry.timestamp, now)}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-12 text-base" disabled={isLoading || !!entry || !!pending} onClick={() => act('in')}>
          {pending === 'in' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
          Registrar entrada
        </Button>
        <Button variant="outline" className="h-12 text-base" disabled={!entry || !!pending} onClick={() => act('out')}>
          {pending === 'out' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          Registrar salida
        </Button>
      </div>
      {!entry && <p className="text-xs text-muted-foreground">La entrada se registrará en {zone.name}.</p>}
    </section>
  )
}
