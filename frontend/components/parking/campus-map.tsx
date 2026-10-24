'use client'

import Image from 'next/image'
import type { TrafficLight, ZoneId, ZoneOccupancy } from '@/lib/types'
import { cn } from '@/lib/utils'

const LIGHT_STYLE: Record<TrafficLight, string> = {
  verde: 'border-success bg-success text-success-foreground',
  amarillo: 'border-warning bg-warning text-warning-foreground',
  rojo: 'border-destructive bg-destructive text-destructive-foreground',
}

export function CampusMap({ zones, selectedId, onSelect }: {
  zones: ZoneOccupancy[]
  selectedId: ZoneId
  onSelect: (id: ZoneId) => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
      <div className="overflow-x-auto rounded-xl" role="group" aria-label="Zonas de estacionamiento del campus">
        <div className="relative min-w-[640px]">
          <Image src="/campus-map.jpg" alt="Mapa del campus de la Universidad Anáhuac Mayab" width={2000} height={926} priority className="block h-auto w-full" />
          {zones.map((z) => (
            <button
              key={z.zone.id}
              type="button"
              aria-pressed={z.zone.id === selectedId}
              aria-label={`${z.zone.id}, ${z.zone.name}, ${z.percentage}% ocupado`}
              onClick={() => onSelect(z.zone.id)}
              style={{ left: `${z.zone.mapPosition.x}%`, top: `${z.zone.mapPosition.y}%` }}
              className={cn(
                'absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-lg font-bold shadow-md transition-[box-shadow,background-color] focus-visible:z-20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring',
                LIGHT_STYLE[z.light],
                z.zone.id === selectedId && 'z-10 ring-4 ring-foreground ring-offset-2 ring-offset-card',
                z.source !== 'registrado' && !z.sensorStatus.online && 'border-dashed',
              )}
            >
              E
            </button>
          ))}
        </div>
      </div>
      <p className="px-1 text-xs text-muted-foreground">Selecciona una E para consultar la zona. En pantallas pequeñas, desliza el mapa horizontalmente.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" aria-hidden="true" />Disponible</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-warning" aria-hidden="true" />Disponibilidad limitada</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-destructive" aria-hidden="true" />Alta ocupación</span>
        {zones.some((z) => z.source !== 'registrado') && <span>Borde discontinuo: sensores fuera de línea</span>}
      </div>
      <p className="px-1 text-xs text-muted-foreground">Capacidades aproximadas, no oficiales. Disponibilidad calculada con registros de entrada y salida. Ubicaciones P9 y P10 aproximadas según el mapa institucional.</p>
    </div>
  )
}
