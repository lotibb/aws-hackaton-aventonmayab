'use client'

import { useEffect, useState } from 'react'
import { DataBadge } from '@/components/shared/data-badge'
import { LIGHT_HINT, LIGHT_SOFT, LIGHT_TEXT, TrafficLight } from '@/components/shared/traffic-light'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProjection } from '@/hooks/use-data'
import { PARKING_ZONES } from '@/lib/config'
import { WEEKDAYS } from '@/lib/format'
import type { User, ZoneId } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ArrivalHelper({ user, defaultZoneId }: { user: User; defaultZoneId: ZoneId }) {
  const [zoneId, setZoneId] = useState<ZoneId>(defaultZoneId)
  useEffect(() => { setZoneId(defaultZoneId) }, [defaultZoneId])
  const [time, setTime] = useState('08:00')
  const weekday = new Date().getDay()
  const validTime = /^\d{2}:\d{2}$/.test(time)
  const { data: projection } = useProjection(user, zoneId, weekday, validTime ? time : '08:00')

  return (
    <section aria-labelledby="arrival" className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="arrival" className="font-semibold">
          {'¿Cuándo llego?'}
        </h2>
        <DataBadge source="estimado" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="arrival-time">Hora de llegada (hoy)</Label>
          <Input id="arrival-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 text-base md:text-base" />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Zona</legend>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-5" role="radiogroup">
            {PARKING_ZONES.map((z) => (
              <button
                key={z.id}
                type="button"
                role="radio"
                aria-checked={zoneId === z.id}
                aria-label={z.name}
                onClick={() => setZoneId(z.id)}
                className={cn(
                  'h-12 rounded-lg border text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                  zoneId === z.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {z.id}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {projection && (
        <div className={cn('flex items-center gap-4 rounded-xl p-3', LIGHT_SOFT[projection.light])} aria-live="polite">
          <TrafficLight light={projection.light} className="scale-90" />
          <div>
            <p className={cn('text-2xl font-semibold tabular-nums', LIGHT_TEXT[projection.light])}>{projection.percentage}%</p>
            <p className="text-sm">
              {LIGHT_HINT[projection.light]} · aprox. {projection.freeSpots} lugares libres
            </p>
            <p className="text-xs text-muted-foreground">
              {WEEKDAYS[weekday]} a las {validTime ? time : '08:00'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
