'use client'

import { CarFront, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { Logo } from '@/components/shared/logo'
import { UserAvatar } from '@/components/shared/user-avatar'
import { buttonVariants } from '@/components/ui/button'
import { useCurrentUser, useNextTrip } from '@/hooks/use-data'
import { firstName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TripCard } from '@/components/trips/trip-card'
import { ModeSwitch } from './mode-switch'
import { ParkingOverview } from './parking-overview'

export function HomeScreen() {
  const user = useCurrentUser()
  const { data: nextTrip, isLoading } = useNextTrip(user)
  const isDriver = user.activeMode === 'conductor'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/perfil" className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <UserAvatar name={user.fullName} photoUrl={user.photoUrl} />
          <span className="sr-only">Ir a mi perfil</span>
        </Link>
      </header>

      <div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight">Hola, {firstName(user.fullName)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDriver ? 'Comparte tus lugares libres con otros estudiantes.' : 'Encuentra un aventón seguro al campus.'}
        </p>
      </div>

      <ModeSwitch user={user} />

      <section aria-labelledby="next-trip" className="flex flex-col gap-3">
        <h2 id="next-trip" className="text-sm font-semibold text-muted-foreground">
          Tu próximo viaje
        </h2>
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        ) : nextTrip ? (
          <TripCard trip={nextTrip} />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <CarFront className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">
              {isDriver ? 'No tienes viajes publicados por ahora.' : 'Aún no tienes viajes reservados.'}
            </p>
          </div>
        )}
        <Link
          href={isDriver ? '/viajes/publicar' : '/viajes'}
          className={cn(buttonVariants(), 'h-12 w-full text-base')}
        >
          {isDriver ? <Plus aria-hidden="true" /> : <Search aria-hidden="true" />}
          {isDriver ? 'Publicar un viaje' : 'Buscar aventón'}
        </Link>
      </section>

      <ParkingOverview user={user} />
    </div>
  )
}
