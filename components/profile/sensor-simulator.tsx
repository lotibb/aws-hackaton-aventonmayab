'use client'

import { ArrowDownToLine, ArrowUpFromLine, Loader2, RotateCcw, Zap } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/app/page-header'
import { DataBadge } from '@/components/shared/data-badge'
import { LIGHT_BG, TrafficLabel } from '@/components/shared/traffic-light'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useCurrentUser, useNow, useSensorEvents, useZonesOccupancy } from '@/hooks/use-data'
import { getZone, PARKING_ZONES } from '@/lib/config'
import { formatRelative } from '@/lib/format'
import { errorMessage, resetDemoData, sensorService } from '@/lib/services'
import type { ZoneId } from '@/lib/types'
import { cn } from '@/lib/utils'

const RUSH_HOUR_CARS = 15
const RUSH_INTERVAL_MS = 120

export function SensorSimulator() {
  const user = useCurrentUser()
  const now = useNow()
  const [zoneId, setZoneId] = useState<ZoneId>('A')
  const [rushing, setRushing] = useState(false)
  const { data: zones } = useZonesOccupancy(user)
  const { data: events } = useSensorEvents(user, zoneId)
  const z = zones?.find((o) => o.zone.id === zoneId)
  const online = z?.sensorStatus.online ?? true

  async function simulate(type: 'entrada' | 'salida') {
    try {
      await sensorService.simulateEvent(user, zoneId, type)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function rushHour() {
    setRushing(true)
    try {
      for (let i = 0; i < RUSH_HOUR_CARS; i++) {
        await sensorService.simulateEvent(user, zoneId, 'entrada')
        await new Promise((r) => setTimeout(r, RUSH_INTERVAL_MS))
      }
      toast.success(`${RUSH_HOUR_CARS} autos entraron a ${getZone(zoneId).name}.`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRushing(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Simulador de sensores"
        description="Modo demo. Imita los eventos que en producción enviarán los contadores infrarrojos vía AWS IoT Core."
        backHref="/perfil"
        className="mb-0"
      />

      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Zona">
        {PARKING_ZONES.map((pz) => {
          const occ = zones?.find((o) => o.zone.id === pz.id)
          return (
            <button
              key={pz.id}
              type="button"
              role="radio"
              aria-checked={zoneId === pz.id}
              onClick={() => setZoneId(pz.id)}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                zoneId === pz.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              )}
            >
              {pz.name}
              {occ && <span className="text-xs font-normal tabular-nums opacity-80">{occ.percentage}%</span>}
            </button>
          )
        })}
      </div>

      {z && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{z.zone.name}</h2>
            <DataBadge source={z.source} />
          </div>
          <p className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums">{z.percentage}%</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {z.occupied} / {z.zone.capacity} autos
            </span>
          </p>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={cn('h-full rounded-full transition-all duration-300', LIGHT_BG[z.light])} style={{ width: `${z.percentage}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <TrafficLabel light={z.light} />
            <span className="text-muted-foreground">Última lectura {formatRelative(z.sensorStatus.lastEventAt, now)}</span>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button className="h-14 text-base" onClick={() => simulate('entrada')} disabled={!online || rushing}>
          <ArrowDownToLine aria-hidden="true" />
          Simular entrada
        </Button>
        <Button variant="outline" className="h-14 text-base" onClick={() => simulate('salida')} disabled={!online || rushing}>
          <ArrowUpFromLine aria-hidden="true" />
          Simular salida
        </Button>
        <Button variant="secondary" className="col-span-2 h-14 text-base" onClick={rushHour} disabled={!online || rushing}>
          {rushing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Zap aria-hidden="true" />}
          Hora pico ({RUSH_HOUR_CARS} entradas)
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="sensor-online" className="text-base">
            Sensores en línea
          </Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Apágalos para ver cómo la zona usa registros manuales y proyecciones.
          </p>
        </div>
        <Switch
          id="sensor-online"
          checked={online}
          onCheckedChange={(v) => sensorService.setOnline(user, zoneId, v)}
        />
      </div>

      <section aria-labelledby="events" className="flex flex-col gap-2">
        <h2 id="events" className="px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Eventos recientes
        </h2>
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {events?.length ? (
            events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                {e.sensorType === 'entrada' ? (
                  <ArrowDownToLine className="size-4 text-success" aria-hidden="true" />
                ) : (
                  <ArrowUpFromLine className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="flex-1 capitalize">{e.sensorType}</span>
                <span className="font-mono text-xs text-muted-foreground">{e.counterId}</span>
                <span className="w-24 text-right text-xs text-muted-foreground">{formatRelative(e.timestamp, now)}</span>
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-muted-foreground">Sin eventos.</li>
          )}
        </ul>
      </section>

      <Button
        variant="ghost"
        className="h-12 text-muted-foreground"
        onClick={() => {
          resetDemoData()
          toast.success('Datos de demostración restablecidos.')
        }}
      >
        <RotateCcw aria-hidden="true" />
        Restablecer datos de demo
      </Button>
    </div>
  )
}
