'use client'

import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/app/page-header'
import { useCurrentUser, useZonesOccupancy } from '@/hooks/use-data'
import type { ZoneId } from '@/lib/types'
import { ArrivalHelper } from './arrival-helper'
import { CampusMap } from './campus-map'
import { ForecastSection } from './forecast-section'
import { ManualCheckIn } from './manual-check-in'
import { ZoneDetail } from './zone-detail'
import { errorMessage } from '@/lib/services/errors'
import { Button } from '@/components/ui/button'

export function ParkingScreen() {
  const user = useCurrentUser()
  const { data: zones, error, mutate } = useZonesOccupancy(user)
  const [zoneId, setZoneId] = useState<ZoneId>('P1')
  const selected = zones?.find((z) => z.zone.id === zoneId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Estacionamiento" description="Ocupación en tiempo real y proyecciones por zona." className="mb-0" />

      <section aria-label="Mapa del campus" className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-2xl border bg-card p-4 text-sm">
            <p className="text-destructive">No pudimos actualizar la disponibilidad. {errorMessage(error)}</p>
            {zones && <p className="mt-1 text-muted-foreground">Los valores mostrados son la última consulta correcta.</p>}
            <Button variant="outline" className="mt-3" onClick={() => mutate()}>Reintentar</Button>
          </div>
        )}
        {zones ? (
          <CampusMap zones={zones} selectedId={zoneId} onSelect={setZoneId} />
        ) : !error ? (
          <div className="aspect-[16/11] animate-pulse rounded-2xl bg-muted" />
        ) : null}
        {selected ? <ZoneDetail occupancy={selected} /> : !error && <div className="h-44 animate-pulse rounded-2xl bg-muted" />}
      </section>

      <ManualCheckIn user={user} zoneId={zoneId} canEnter={!!selected && !error} />

      <ForecastSection user={user} zoneId={zoneId} />

      <ArrivalHelper user={user} defaultZoneId={zoneId} />

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        La ocupación es agregada a partir de registros de entrada y salida. No publicamos quién está estacionado ni datos de vehículos.
      </p>
    </div>
  )
}
