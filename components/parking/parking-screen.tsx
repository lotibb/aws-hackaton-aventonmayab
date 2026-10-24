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

export function ParkingScreen() {
  const user = useCurrentUser()
  const { data: zones } = useZonesOccupancy(user)
  const [zoneId, setZoneId] = useState<ZoneId>('A')
  const selected = zones?.find((z) => z.zone.id === zoneId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Estacionamiento" description="Ocupación en tiempo real y proyecciones por zona." className="mb-0" />

      <section aria-label="Mapa del campus" className="flex flex-col gap-4">
        {zones ? (
          <CampusMap zones={zones} selectedId={zoneId} onSelect={setZoneId} />
        ) : (
          <div className="aspect-[16/11] animate-pulse rounded-2xl bg-muted" />
        )}
        {selected ? <ZoneDetail occupancy={selected} /> : <div className="h-44 animate-pulse rounded-2xl bg-muted" />}
      </section>

      <ManualCheckIn user={user} zoneId={zoneId} />

      <ForecastSection user={user} zoneId={zoneId} />

      <ArrivalHelper user={user} defaultZoneId={zoneId} />

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        La ocupación es agregada. Los sensores solo cuentan autos: no capturan placas ni imágenes, y nunca mostramos quién está
        estacionado.
      </p>
    </div>
  )
}
