'use client'

import { Clock, Lock, MapPin, MapPinned, Navigation, Route, Users } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/app/page-header'
import { ComingSoonBadge } from '@/components/shared/coming-soon'
import { UserAvatar } from '@/components/shared/user-avatar'
import { useCurrentUser, useTrip } from '@/hooks/use-data'
import { firstName, formatTripDate } from '@/lib/format'
import { TripActions } from './trip-actions'
import { TripProgress, TripStatusBadge, TripTimeline } from './trip-status'

export function TripDetailFromQuery() {
  return <TripDetail tripId={useSearchParams().get('id') ?? ''} />
}

export function TripDetail({ tripId }: { tripId: string }) {
  const user = useCurrentUser()
  const { data: trip, isLoading } = useTrip(user, tripId)

  if (isLoading && !trip) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-10 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-56 animate-pulse rounded-2xl bg-muted" />
      </div>
    )
  }

  if (!trip) {
    return (
      <div>
        <PageHeader title="Viaje no disponible" backHref="/viajes" />
        <p className="text-sm text-muted-foreground">Este viaje no existe o ya no está disponible para ti.</p>
      </div>
    )
  }

  const isParticipant = trip.myRole !== 'ninguno'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Detalle del viaje" backHref="/viajes" action={<TripStatusBadge status={trip.status} />} className="mb-0" />

      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4" aria-label="Estado del viaje">
        <TripProgress status={trip.status} />
        <TripTimeline status={trip.status} />
      </section>

      <section className="flex items-center gap-3" aria-label="Conductor">
        <UserAvatar name={trip.driver.displayName} photoUrl={trip.driver.photoUrl} className="size-14" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{trip.myRole === 'conductor' ? 'Conduces tú' : 'Conductor'}</p>
          <p className="truncate text-lg font-semibold">
            {trip.myRole === 'conductor' ? 'Tú' : isParticipant ? trip.driver.displayName : firstName(trip.driver.displayName)}
          </p>
          <p className="text-sm text-muted-foreground">Estudiante verificado · {trip.driver.colonia}</p>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-3">
        <Detail icon={Clock} label="Salida">
          <span className="capitalize">{formatTripDate(trip.date)}</span>, {trip.time}
        </Detail>
        <Detail icon={Users} label="Lugares">
          {trip.seatsAvailable} de {trip.seatsTotal} libres
        </Detail>
        <Detail icon={MapPin} label="Sale de">
          {trip.originColonia}
        </Detail>
        <Detail icon={Navigation} label="Destino">
          {trip.destination}
        </Detail>
        <Detail icon={Route} label="Ruta" className="col-span-2">
          {trip.routeDescription}
        </Detail>
      </dl>

      {trip.meetingPoint ? (
        <section className="flex flex-col gap-1 rounded-2xl border border-primary/30 bg-primary/6 p-4" aria-labelledby="meeting">
          <h2 id="meeting" className="flex items-center gap-2 text-sm font-semibold text-primary">
            <MapPinned className="size-4" aria-hidden="true" />
            Punto de encuentro
          </h2>
          <p className="font-medium">{trip.meetingPoint.name}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{trip.meetingPoint.description}</p>
          {trip.pickupTime && <p className="mt-1 text-sm">Pasa por ti a las {trip.pickupTime}</p>}
        </section>
      ) : (
        trip.status !== 'finalizado' &&
        trip.status !== 'cancelado' && (
          <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            El punto de encuentro exacto se muestra solo cuando el conductor acepta tu solicitud.
          </p>
        )
      )}

      <section aria-disabled="true" aria-labelledby="live" className="flex flex-col gap-2 rounded-2xl border border-dashed p-4 text-muted-foreground">
        <div className="flex items-center gap-2">
          <Navigation className="size-4" aria-hidden="true" />
          <h2 id="live" className="flex-1 text-sm font-semibold">
            Ubicación en vivo
          </h2>
          <ComingSoonBadge />
        </div>
        <p className="text-sm leading-relaxed">
          En el futuro podrás compartir tu GPS de forma voluntaria y temporal: desde 15 minutos antes de la recogida hasta que termine
          el viaje. Podrás revocarlo en cualquier momento y se elimina al finalizar.
        </p>
      </section>

      <TripActions user={user} trip={trip} />
    </div>
  )
}

function Detail({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: typeof Clock
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border bg-card p-3 ${className ?? ''}`}>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-sm font-medium leading-snug">{children}</dd>
    </div>
  )
}
