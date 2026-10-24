'use client'

import { CalendarDays, Lock, Loader2, Minus, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { LocationPicker } from '@/components/shared/location-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser, useSchedules } from '@/hooks/use-data'
import { DEFAULT_DESTINATION, TRIP_LOCATION_SUGGESTIONS } from '@/lib/config'
import { addDays, toIsoDate } from '@/lib/format'
import { weeklyTripDays } from '@/lib/schedule-grid'
import { errorMessage, tripService } from '@/lib/services'
import { cn } from '@/lib/utils'
import { WeeklyDaysTable } from './weekly-days'

const TRIP_KINDS = [
  { weekly: false, label: 'Un viaje' },
  { weekly: true, label: 'Mi semana de clases' },
]

export function PublishTripForm() {
  const user = useCurrentUser()
  const router = useRouter()
  const [weekly, setWeekly] = useState(false)
  const { data: schedules, error: scheduleError } = useSchedules(user)
  const weekDays = weeklyTripDays(schedules ?? [])
  const [origin, setOrigin] = useState<string>(user.colonia)
  const [destination, setDestination] = useState(DEFAULT_DESTINATION)
  const [meetingPoint, setMeetingPoint] = useState('')
  const [route, setRoute] = useState('')
  const [date, setDate] = useState(toIsoDate(addDays(new Date(), 1)))
  const [time, setTime] = useState('07:00')
  const [seats, setSeats] = useState(3)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (origin.trim().length < 2) return setError('Escribe de dónde sales.')
    if (destination.trim().length < 2) return setError('Escribe a dónde vas.')
    if (weekly && weekDays.length === 0) return setError('Primero arma tu horario de clases en tu perfil.')
    setError(undefined)
    setPending(true)
    try {
      const common = {
        originColonia: origin,
        destination,
        routeDescription: route.trim(),
        seatsTotal: seats,
        meetingPoint: meetingPoint.trim() || undefined,
      }
      const trip = weekly
        ? await tripService.publishWeeklyTrip(user, common)
        : await tripService.publishTrip(user, { ...common, date, time })
      toast.success(weekly ? 'Tu semana quedó publicada.' : 'Viaje publicado.')
      router.replace(`/viajes/detalle?id=${encodeURIComponent(trip.id)}`)
    } catch (err) {
      setError(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div role="radiogroup" aria-label="Tipo de viaje" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {TRIP_KINDS.map((kind) => (
          <button
            key={kind.label}
            type="button"
            role="radio"
            aria-checked={weekly === kind.weekly}
            onClick={() => setWeekly(kind.weekly)}
            className={cn(
              'h-11 rounded-lg text-sm font-medium transition-colors',
              weekly === kind.weekly ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            {kind.label}
          </button>
        ))}
      </div>

      {weekly && (
        <section aria-labelledby="weekly-title" className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <h2 id="weekly-title" className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="size-4" aria-hidden="true" />
            Tu semana, según tu horario
          </h2>
          {scheduleError ? (
            <p className="text-sm text-muted-foreground">No pudimos cargar tu horario. Intenta de nuevo.</p>
          ) : schedules === undefined ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          ) : weekDays.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Aún no tienes clases en tu horario.{' '}
              <Link href="/perfil" className="font-medium text-primary underline-offset-4 hover:underline">
                Ármalo en tu perfil
              </Link>{' '}
              y vuelve para publicar tu semana.
            </p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Los compañeros piden unirse a toda tu semana, no a un solo día. Llegas a tu primera clase y sales al terminar la última.
              </p>
              <WeeklyDaysTable days={weekDays} />
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Solo se publican estas horas. Tus materias, edificios y salones siguen siendo privados.
              </p>
            </>
          )}
        </section>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="origin">Sales de</Label>
        <LocationPicker
          id="origin"
          value={origin}
          onChange={(location) => setOrigin(location ?? '')}
          options={TRIP_LOCATION_SUGGESTIONS}
          placeholder="Colonia, universidad o punto de referencia"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="destination">¿A dónde vas?</Label>
        <LocationPicker
          id="destination"
          value={destination}
          onChange={(location) => setDestination(location ?? '')}
          options={TRIP_LOCATION_SUGGESTIONS}
          placeholder="Destino"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="meeting-point">Punto de encuentro público (opcional)</Label>
        <Input
          id="meeting-point"
          value={meetingPoint}
          onChange={(event) => setMeetingPoint(event.target.value)}
          placeholder="Ej. entrada principal de la Anáhuac"
          maxLength={120}
          className="h-12 text-base md:text-base"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Puedes definirlo después de aceptar pasajeros. Escribe un lugar público; no compartas tu domicilio. Solo lo verán las personas aceptadas.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="route">Ruta aproximada (opcional)</Label>
        <Textarea
          id="route"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          placeholder="Ej. Por Periférico Norte y la carretera a Progreso"
          className="min-h-20 text-base md:text-base"
          maxLength={140}
        />
        <p className="text-xs text-muted-foreground">No incluyas direcciones particulares.</p>
      </div>

      {!weekly && <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">Fecha</Label>
          <Input
            id="date"
            type="date"
            value={date}
            min={toIsoDate(new Date())}
            onChange={(e) => setDate(e.target.value)}
            className="h-12 text-base md:text-base"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="time">Hora de salida</Label>
          <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 text-base md:text-base" />
        </div>
      </div>}

      <div className="flex items-center justify-between rounded-xl border bg-card p-3">
        <div>
          <p className="text-sm font-medium" id="seats-label">
            Lugares disponibles
          </p>
          <p className="text-xs text-muted-foreground">Máximo 4</p>
        </div>
        <div className="flex items-center gap-3" role="group" aria-labelledby="seats-label">
          <Button type="button" variant="outline" size="icon-lg" className="size-11" onClick={() => setSeats((s) => Math.max(1, s - 1))} disabled={seats <= 1}>
            <Minus aria-hidden="true" />
            <span className="sr-only">Quitar un lugar</span>
          </Button>
          <span className="w-6 text-center text-xl font-semibold tabular-nums" aria-live="polite">
            {seats}
          </span>
          <Button type="button" variant="outline" size="icon-lg" className="size-11" onClick={() => setSeats((s) => Math.min(4, s + 1))} disabled={seats >= 4}>
            <Plus aria-hidden="true" />
            <span className="sr-only">Agregar un lugar</span>
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="h-12 text-base" disabled={pending || (weekly && weekDays.length === 0)}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {weekly ? 'Publicar mi semana' : 'Publicar viaje'}
      </Button>
    </form>
  )
}
