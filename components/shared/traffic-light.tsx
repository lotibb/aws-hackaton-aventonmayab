import type { TrafficLight as Light } from '@/lib/types'
import { cn } from '@/lib/utils'

export const LIGHT_LABEL: Record<Light, string> = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' }
export const LIGHT_HINT: Record<Light, string> = {
  verde: 'Hay lugares',
  amarillo: 'Se está llenando',
  rojo: 'Casi lleno',
}

export const LIGHT_BG: Record<Light, string> = {
  verde: 'bg-success',
  amarillo: 'bg-warning',
  rojo: 'bg-destructive',
}

export const LIGHT_TEXT: Record<Light, string> = {
  verde: 'text-success',
  amarillo: 'text-warning-foreground dark:text-warning',
  rojo: 'text-destructive',
}

export const LIGHT_SOFT: Record<Light, string> = {
  verde: 'bg-success/12',
  amarillo: 'bg-warning/20',
  rojo: 'bg-destructive/12',
}

export function TrafficLightDot({ light, className }: { light: Light; className?: string }) {
  return <span className={cn('inline-block size-2.5 shrink-0 rounded-full', LIGHT_BG[light], className)} aria-hidden="true" />
}

/** Three stacked lamps, with only the active one lit. Color is never the only signal: text label included. */
export function TrafficLight({ light, className }: { light: Light; className?: string }) {
  const order: Light[] = ['rojo', 'amarillo', 'verde']
  return (
    <span
      role="img"
      aria-label={`Semáforo ${LIGHT_LABEL[light].toLowerCase()}: ${LIGHT_HINT[light].toLowerCase()}`}
      className={cn('inline-flex flex-col items-center gap-1 rounded-full bg-foreground/90 p-1.5 dark:bg-background', className)}
    >
      {order.map((l) => (
        <span key={l} className={cn('size-2.5 rounded-full', l === light ? LIGHT_BG[l] : 'bg-muted-foreground/30')} />
      ))}
    </span>
  )
}

export function TrafficLabel({ light, className }: { light: Light; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', LIGHT_SOFT[light], LIGHT_TEXT[light], className)}>
      <TrafficLightDot light={light} />
      {LIGHT_HINT[light]}
    </span>
  )
}
