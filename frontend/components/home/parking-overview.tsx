'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { DataBadge } from '@/components/shared/data-badge'
import { TrafficLight } from '@/components/shared/traffic-light'
import { useZonesOccupancy } from '@/hooks/use-data'
import type { User } from '@/lib/types'
import { errorMessage } from '@/lib/services/errors'

export function ParkingOverview({ user }: { user: User }) {
  const { data: zones, error } = useZonesOccupancy(user)

  return (
    <section aria-labelledby="parking-overview" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="parking-overview" className="text-sm font-semibold text-muted-foreground">
          Estacionamiento ahora
        </h2>
        <Link href="/estacionamiento" className="flex min-h-11 items-center gap-0.5 text-sm font-medium text-primary">
          Ver detalle
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">No pudimos actualizar Parking. {errorMessage(error)}</p>}
      <ul className="grid grid-cols-2 gap-3">
        {(zones ?? []).map((z) => (
          <li key={z.zone.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{z.zone.name}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {z.occupied} / {z.zone.capacity}
                </p>
              </div>
              <TrafficLight light={z.light} />
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-2xl font-semibold tabular-nums">{z.percentage}%</span>
              <DataBadge source={z.source} />
            </div>
          </li>
        ))}
        {!zones && !error &&
          Array.from({ length: 4 }, (_, i) => <li key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
      </ul>
    </section>
  )
}
