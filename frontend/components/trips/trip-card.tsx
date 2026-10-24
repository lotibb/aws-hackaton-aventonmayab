import { ChevronRight, Clock, MapPin, Users } from 'lucide-react'
import Link from 'next/link'
import { UserAvatar } from '@/components/shared/user-avatar'
import { firstName, formatTripDate } from '@/lib/format'
import type { TripView } from '@/lib/types'
import { TripProgress, TripStatusBadge } from './trip-status'

/** Shows only first name, photo, colonia, time, seats and state. Never an address. */
export function TripCard({ trip }: { trip: TripView }) {
  const roleLabel = trip.myRole === 'conductor' ? 'Tú conduces' : trip.myRole === 'pasajero' ? 'Vas como pasajero' : null
  return (
    <Link
      href={`/viajes/${trip.id}`}
      className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 text-card-foreground outline-none transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-3">
        <UserAvatar name={trip.driver.displayName} photoUrl={trip.driver.photoUrl} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{firstName(trip.driver.displayName)}</p>
          <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {trip.originColonia}
          </p>
        </div>
        <TripStatusBadge status={trip.status} />
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="capitalize">{formatTripDate(trip.date)}</span> · {trip.time}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          {trip.seatsAvailable} {trip.seatsAvailable === 1 ? 'lugar' : 'lugares'}
        </span>
      </div>

      <TripProgress status={trip.status} />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{roleLabel ?? `Hacia ${trip.destination}`}</span>
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  )
}
