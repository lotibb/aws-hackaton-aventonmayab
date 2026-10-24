'use client'

import { Loader2, Minus, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { LocationPicker } from '@/components/shared/location-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/hooks/use-data'
import { DEFAULT_DESTINATION, TRIP_LOCATION_SUGGESTIONS } from '@/lib/config'
import { addDays, toIsoDate } from '@/lib/format'
import { errorMessage, tripService } from '@/lib/services'

export function PublishTripForm() {
  const user = useCurrentUser()
  const router = useRouter()
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
    setError(undefined)
    setPending(true)
    try {
      const trip = await tripService.publishTrip(user, {
        originColonia: origin,
        destination,
        routeDescription: route.trim(),
        date,
        time,
        seatsTotal: seats,
        meetingPoint: meetingPoint.trim() || undefined,
      })
      toast.success('Viaje publicado.')
      router.replace(`/viajes/detalle?id=${encodeURIComponent(trip.id)}`)
    } catch (err) {
      setError(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
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

      <div className="grid grid-cols-2 gap-3">
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
      </div>

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

      <Button type="submit" className="h-12 text-base" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Publicar viaje
      </Button>
    </form>
  )
}
