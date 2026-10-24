import { TRIP_STATUS_LABEL } from '@/lib/format'
import type { TripStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const STYLE: Record<TripStatus, string> = {
  publicado: 'bg-secondary text-secondary-foreground',
  solicitud_pendiente: 'bg-warning/20 text-warning-foreground dark:text-warning',
  aceptado: 'bg-primary/12 text-primary',
  finalizado: 'bg-muted text-muted-foreground',
  cancelado: 'bg-destructive/12 text-destructive',
}

const STEPS: TripStatus[] = ['publicado', 'solicitud_pendiente', 'aceptado', 'finalizado']

export function TripStatusBadge({ status, className }: { status: TripStatus; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap', STYLE[status], className)}>
      {TRIP_STATUS_LABEL[status]}
    </span>
  )
}

/** Five-segment indicator of the trip lifecycle. Cancelled trips show a single red bar. */
export function TripProgress({ status, className }: { status: TripStatus; className?: string }) {
  if (status === 'cancelado') {
    return (
      <div className={cn('h-1.5 w-full rounded-full bg-destructive/30', className)} role="img" aria-label="Viaje cancelado" />
    )
  }
  const current = STEPS.indexOf(status)
  return (
    <div
      className={cn('flex w-full gap-1', className)}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
      aria-valuenow={current + 1}
      aria-valuetext={`Paso ${current + 1} de ${STEPS.length}: ${TRIP_STATUS_LABEL[status]}`}
    >
      {STEPS.map((s, i) => (
        <span key={s} className={cn('h-1.5 flex-1 rounded-full', i <= current ? 'bg-primary' : 'bg-muted')} />
      ))}
    </div>
  )
}

export function TripTimeline({ status }: { status: TripStatus }) {
  const current = STEPS.indexOf(status)
  return (
    <ol className="flex justify-between gap-1 text-[11px] text-muted-foreground">
      {STEPS.map((s, i) => (
        <li
          key={s}
          className={cn('flex-1 text-center leading-tight', status !== 'cancelado' && i === current && 'font-semibold text-foreground')}
        >
          {TRIP_STATUS_LABEL[s]}
        </li>
      ))}
    </ol>
  )
}
