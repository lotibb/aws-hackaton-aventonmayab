'use client'

import { AlertTriangle, Radio, SearchCheck } from 'lucide-react'
import { DataBadge } from '@/components/shared/data-badge'
import { LIGHT_BG, TrafficLabel, TrafficLight } from '@/components/shared/traffic-light'
import { useNow } from '@/hooks/use-data'
import { formatRelative } from '@/lib/format'
import type { ZoneOccupancy } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ZoneDetail({ occupancy: o }: { occupancy: ZoneOccupancy }) {
  const now = useNow()
  const online = o.sensorStatus.online

  return (
    <article className="flex flex-col gap-4 rounded-2xl border bg-card p-4" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{o.zone.name}</h2>
          <p className="text-sm text-muted-foreground">{o.zone.id} · {o.zone.area}</p>
          <p className="text-xs text-muted-foreground">Capacidad {o.zone.capacityEstimated ? 'estimada' : ''}: {o.zone.capacity} lugares</p>
        </div>
        <DataBadge source={o.source} />
      </div>

      <div className="flex items-center gap-4">
        <TrafficLight light={o.light} />
        <div className="flex flex-1 flex-col gap-1">
          <p className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums">{o.percentage}%</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {o.occupied} ocupados · {Math.max(0, o.zone.capacity - o.occupied)} disponibles
            </span>
          </p>
          <TrafficLabel light={o.light} />
        </div>
      </div>

      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={o.percentage}
        aria-label={`Ocupación de ${o.zone.name}`}
      >
        <div className={cn('h-full rounded-full transition-all duration-500', LIGHT_BG[o.light])} style={{ width: `${o.percentage}%` }} />
      </div>

      {o.source === 'registrado' ? (
        <p className="text-sm text-muted-foreground">
          Conteo de entradas registradas en el servidor; no incluye vehículos sin registro.
          {o.updatedAt && <> Última actualización {formatRelative(o.updatedAt, now)}.</>}
        </p>
      ) : online ? (
        <p className="flex items-center gap-2 text-sm">
          <Radio className="size-4 text-success" aria-hidden="true" />
          <span className="font-medium">Sensores en línea</span>
          <span className="text-muted-foreground">· Última lectura {formatRelative(o.sensorStatus.lastEventAt, now)}</span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-warning/20 p-3 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden="true" />
          <span>
            <span className="font-medium">Sensores fuera de línea.</span> Mostramos un estimado con registros manuales y proyecciones.
            Última lectura {formatRelative(o.sensorStatus.lastEventAt, now)}.
          </span>
        </p>
      )}

      {o.inReview && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <SearchCheck className="size-4" aria-hidden="true" />
          Datos en revisión: los sensores ({o.sensorOccupied}) y los registros manuales ({o.manualEstimate}) difieren más de 10%.
        </p>
      )}
    </article>
  )
}
