'use client'

import type { TrafficLight, ZoneId, ZoneOccupancy } from '@/lib/types'
import { cn } from '@/lib/utils'

const LIGHT_FILL: Record<TrafficLight, string> = {
  verde: 'fill-success/25 stroke-success',
  amarillo: 'fill-warning/35 stroke-warning',
  rojo: 'fill-destructive/25 stroke-destructive',
}

interface ZoneShape {
  x: number
  y: number
  w: number
  h: number
  entrance: [number, number]
  exit: [number, number]
}

/** Stylized layout, not to scale. Sensor markers sit where the counters are installed. */
const SHAPES: Record<ZoneId, ZoneShape> = {
  A: { x: 24, y: 28, w: 112, h: 64, entrance: [24, 46], exit: [24, 76] },
  B: { x: 184, y: 28, w: 112, h: 64, entrance: [296, 46], exit: [296, 76] },
  C: { x: 24, y: 148, w: 92, h: 48, entrance: [24, 162], exit: [24, 184] },
  D: { x: 204, y: 148, w: 92, h: 48, entrance: [296, 162], exit: [296, 184] },
}

const BUILDINGS = [
  { x: 146, y: 36, w: 28, h: 48, label: 'Rectoría' },
  { x: 128, y: 136, w: 64, h: 28, label: 'Biblioteca' },
  { x: 128, y: 172, w: 64, h: 24, label: 'Salud' },
]

function SensorMarker({ x, y, type, offline }: { x: number; y: number; type: 'entrada' | 'salida'; offline: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={6} className={cn('stroke-2', offline ? 'fill-muted stroke-muted-foreground' : 'fill-card stroke-foreground')} />
      <path
        d={type === 'entrada' ? 'M-2.5 -2.5 L2.5 0 L-2.5 2.5' : 'M2.5 -2.5 L-2.5 0 L2.5 2.5'}
        className={cn('fill-none stroke-[1.5]', offline ? 'stroke-muted-foreground' : 'stroke-foreground')}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  )
}

export function CampusMap({
  zones,
  selectedId,
  onSelect,
}: {
  zones: ZoneOccupancy[]
  selectedId: ZoneId
  onSelect: (id: ZoneId) => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
      <svg viewBox="0 0 320 220" className="h-auto w-full" role="group" aria-label="Zonas de estacionamiento">
        <rect x={4} y={4} width={312} height={212} rx={16} className="fill-muted/60" />
        <path d="M4 120 H316" className="stroke-border stroke-[14]" />
        <path d="M160 4 V120" className="stroke-border stroke-[10]" />
        <text x={160} y={124} textAnchor="middle" className="fill-muted-foreground text-[8px] font-medium">
          Circuito interior
        </text>

        {BUILDINGS.map((b) => (
          <g key={b.label} aria-hidden="true">
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} className="fill-secondary stroke-border" />
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3} textAnchor="middle" className="fill-muted-foreground text-[7px]">
              {b.label}
            </text>
          </g>
        ))}

        {zones.map((z) => {
          const s = SHAPES[z.zone.id]
          const selected = z.zone.id === selectedId
          const offline = !z.sensorStatus.online
          return (
            <g
              key={z.zone.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${z.zone.name}, ${z.percentage}% ocupada`}
              onClick={() => onSelect(z.zone.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(z.zone.id)
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-ring"
            >
              <rect
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx={10}
                className={cn(LIGHT_FILL[z.light], 'transition-[fill,stroke-width]', selected ? 'stroke-[3]' : 'stroke-[1.5]')}
                strokeDasharray={offline ? '5 4' : undefined}
              />
              <text x={s.x + s.w / 2} y={s.y + s.h / 2 - 2} textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
                {z.zone.name}
              </text>
              <text x={s.x + s.w / 2} y={s.y + s.h / 2 + 13} textAnchor="middle" className="fill-foreground text-[11px] tabular-nums">
                {z.percentage}%
              </text>
              <SensorMarker x={s.entrance[0]} y={s.entrance[1]} type="entrada" offline={offline} />
              <SensorMarker x={s.exit[0]} y={s.exit[1]} type="salida" offline={offline} />
            </g>
          )
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <svg viewBox="-7 -7 14 14" className="size-3.5" aria-hidden="true">
            <circle r={6} className="fill-card stroke-foreground stroke-2" />
          </svg>
          Sensor infrarrojo (entrada / salida)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-muted-foreground" aria-hidden="true" />
          Sensores fuera de línea
        </span>
      </div>
    </div>
  )
}
