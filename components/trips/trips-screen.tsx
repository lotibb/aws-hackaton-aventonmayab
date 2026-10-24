'use client'

import { Plus, SearchX } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '@/components/app/page-header'
import { ColoniaPicker } from '@/components/shared/colonia-picker'
import { buttonVariants } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAvailableTrips, useCurrentUser, useMyTrips } from '@/hooks/use-data'
import type { TripFilters } from '@/lib/services'
import type { Colonia, TripView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { TripCard } from './trip-card'

const TIME_WINDOWS: Array<{ id: string; label: string; from?: number; to?: number }> = [
  { id: 'all', label: 'Todo el día' },
  { id: 'early', label: 'Antes de 8:00', to: 8 * 60 - 1 },
  { id: 'morning', label: '8:00 – 12:00', from: 8 * 60, to: 12 * 60 },
  { id: 'afternoon', label: 'Después de 12:00', from: 12 * 60 + 1 },
]

export function TripsScreen() {
  const user = useCurrentUser()
  const [colonia, setColonia] = useState<Colonia | undefined>()
  const [windowId, setWindowId] = useState('all')
  const tw = TIME_WINDOWS.find((w) => w.id === windowId) ?? TIME_WINDOWS[0]
  const filters: TripFilters = { colonia, fromMinutes: tw.from, toMinutes: tw.to }
  const { data: available, isLoading: loadingAvailable } = useAvailableTrips(user, filters)
  const { data: mine, isLoading: loadingMine } = useMyTrips(user)

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Viajes"
        description="Aventones entre estudiantes verificados."
        action={
          <Link href="/viajes/publicar" className={cn(buttonVariants({ size: 'lg' }), 'h-11')}>
            <Plus aria-hidden="true" />
            Publicar
          </Link>
        }
      />

      <Tabs defaultValue={user.activeMode === 'conductor' ? 'mine' : 'search'}>
        <TabsList className="h-11 w-full">
          <TabsTrigger value="search" className="h-9">
            Buscar
          </TabsTrigger>
          <TabsTrigger value="mine" className="h-9">
            Mis viajes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <ColoniaPicker value={colonia} onChange={setColonia} allowAll placeholder="Todas las colonias" />
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Horario">
              {TIME_WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  role="radio"
                  aria-checked={windowId === w.id}
                  onClick={() => setWindowId(w.id)}
                  className={cn(
                    'h-10 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                    windowId === w.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <TripList trips={available} loading={loadingAvailable} empty="No hay viajes con estos filtros. Prueba otra colonia u horario." />
        </TabsContent>

        <TabsContent value="mine" className="mt-4">
          <TripList trips={mine} loading={loadingMine} empty="Aún no tienes viajes. Publica uno o solicita un lugar." />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TripList({ trips, loading, empty }: { trips?: TripView[]; loading: boolean; empty: string }) {
  if (loading && !trips) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    )
  }
  if (!trips || trips.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
        <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-pretty text-sm text-muted-foreground">{empty}</p>
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {trips.map((t) => (
        <li key={t.id}>
          <TripCard trip={t} />
        </li>
      ))}
    </ul>
  )
}
