'use client'

import { Loader2, Minus, Plus, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ColoniaPicker } from '@/components/shared/colonia-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/hooks/use-data'
import { DEFAULT_DESTINATION, meetingPointsNear } from '@/lib/config'
import { addDays, toIsoDate } from '@/lib/format'
import { errorMessage, tripService } from '@/lib/services'
import type { Colonia } from '@/lib/types'
import { cn } from '@/lib/utils'

export function PublishTripForm() {
  const user = useCurrentUser()
  const router = useRouter()
  const [colonia, setColonia] = useState<Colonia | undefined>(user.colonia)
  const points = colonia ? meetingPointsNear(colonia) : []
  const [meetingPointId, setMeetingPointId] = useState<string>(points[0]?.id ?? '')
  const [route, setRoute] = useState('')
  const [date, setDate] = useState(toIsoDate(addDays(new Date(), 1)))
  const [time, setTime] = useState('07:00')
  const [seats, setSeats] = useState(3)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  function changeColonia(c: Colonia | undefined) {
    setColonia(c)
    setMeetingPointId(c ? (meetingPointsNear(c)[0]?.id ?? '') : '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!colonia) return setError('Elige la colonia de salida.')
    if (!meetingPointId) return setError('Elige un punto de encuentro público.')
    if (route.trim().length < 5) return setError('Describe brevemente tu ruta.')
    setError(undefined)
    setPending(true)
    try {
      const trip = await tripService.publishTrip(user, {
        originColonia: colonia,
        routeDescription: route.trim(),
        date,
        time,
        seatsTotal: seats,
        meetingPointId,
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
        <ColoniaPicker id="origin" value={colonia} onChange={changeColonia} />
        <p className="text-xs text-muted-foreground">Destino: {DEFAULT_DESTINATION}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Punto de encuentro público</legend>
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">Elige una colonia para ver los puntos disponibles.</p>
        ) : (
          <div className="flex flex-col gap-2" role="radiogroup">
            {points.map((p) => (
              <label
                key={p.id}
                className={cn(
                  'flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                  meetingPointId === p.id ? 'border-primary bg-primary/6' : 'bg-card hover:bg-muted/50',
                )}
              >
                <input
                  type="radio"
                  name="meetingPoint"
                  value={p.id}
                  checked={meetingPointId === p.id}
                  onChange={() => setMeetingPointId(p.id)}
                  className="mt-1 size-4 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">{p.name}</span>
                  {p.distanceKm >= 0.5 && (
                    <span className="block text-xs text-muted-foreground">
                      {p.colonia} · a {p.distanceKm.toFixed(1)} km de tu colonia
                    </span>
                  )}
                  <span className="block text-xs leading-relaxed text-muted-foreground">{p.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
          Solo se mostrará a pasajeros aceptados.
        </p>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="route">Ruta aproximada</Label>
        <Textarea
          id="route"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          placeholder="Ej. Por Periférico Norte y la carretera a Progreso"
          className="min-h-20 text-base md:text-base"
          maxLength={160}
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
