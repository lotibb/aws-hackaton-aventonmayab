'use client'

import { Check, Loader2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage, tripService } from '@/lib/services'
import { ContactPhone } from './contact-phone'
import type { TripView, User } from '@/lib/types'

function useAction() {
  const [pending, setPending] = useState<string | null>(null)
  async function run(key: string, fn: () => Promise<void>, success: string) {
    setPending(key)
    try {
      await fn()
      toast.success(success)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPending(null)
    }
  }
  return { pending, run }
}

function Spinner({ show }: { show: boolean }) {
  return show ? <Loader2 className="animate-spin" aria-hidden="true" /> : null
}

export function TripActions({ user, trip }: { user: User; trip: TripView }) {
  if (trip.myRole === 'conductor') return <DriverActions user={user} trip={trip} />
  return <PassengerActions user={user} trip={trip} />
}

function DriverActions({ user, trip }: { user: User; trip: TripView }) {
  const { pending, run } = useAction()
  const router = useRouter()
  const requests = trip.requests ?? []
  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const accepted = requests.filter((r) => r.status === 'accepted')

  return (
    <div className="flex flex-col gap-5">
      {trip.storedStatus === 'publicado' && (
        <section aria-labelledby="requests" className="flex flex-col gap-3">
          <h2 id="requests" className="text-sm font-semibold text-muted-foreground">
            Solicitudes ({pendingRequests.length})
          </h2>
          {pendingRequests.length === 0 && (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Sin solicitudes pendientes.</p>
          )}
          <ul className="flex flex-col gap-2">
            {pendingRequests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <UserAvatar name={r.passenger.displayName} photoUrl={r.passenger.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.passenger.displayName}</p>
                  <p className="text-xs text-muted-foreground">{r.passenger.colonia}</p>
                </div>
                <Button
                  variant="outline"
                  size="icon-lg"
                  className="size-11"
                  disabled={!!pending}
                  onClick={() => run(`no-${r.id}`, () => tripService.respondToRequest(user, r.id, false), 'Solicitud rechazada.')}
                >
                  {pending === `no-${r.id}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
                  <span className="sr-only">Rechazar a {r.passenger.displayName}</span>
                </Button>
                <Button
                  size="icon-lg"
                  className="size-11"
                  disabled={!!pending || trip.seatsAvailable === 0}
                  onClick={() => run(`ok-${r.id}`, () => tripService.respondToRequest(user, r.id, true), 'Solicitud aceptada.')}
                >
                  {pending === `ok-${r.id}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                  <span className="sr-only">Aceptar a {r.passenger.displayName}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {accepted.length > 0 && (
        <>
          <section aria-labelledby="passengers" className="flex flex-col gap-3">
            <h2 id="passengers" className="text-sm font-semibold text-muted-foreground">
              Pasajeros confirmados
            </h2>
            <ul className="flex flex-col gap-2">
              {accepted.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={r.passenger.displayName} photoUrl={r.passenger.photoUrl} className="size-8" />
                    <span className="text-sm font-medium">{r.passenger.displayName}</span>
                  </div>
                  {r.passenger.phone && <ContactPhone name={r.passenger.displayName} phone={r.passenger.phone} />}
                </li>
              ))}
            </ul>
          </section>
          {(trip.storedStatus === 'publicado' || trip.storedStatus === 'en_curso') && (
            <MeetingPointEditor key={trip.meetingPoint ?? 'not-set'} user={user} trip={trip} />
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        {trip.storedStatus === 'publicado' && (
          <>
            <Button
              variant="ghost"
              className="h-12 text-base text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={!!pending}
              onClick={() =>
                run(
                  'cancel',
                  async () => {
                    await tripService.cancelTrip(user, trip.id)
                    router.replace('/viajes')
                  },
                  'Viaje cancelado. Avisamos a tus pasajeros.',
                )
              }
            >
              <Spinner show={pending === 'cancel'} />
              Cancelar viaje
            </Button>
          </>
        )}
        {accepted.length > 0 && (trip.storedStatus === 'publicado' || trip.storedStatus === 'en_curso') && (
          <Button
            className="h-12 text-base"
            disabled={!!pending}
            onClick={() => run('complete', () => tripService.completeTrip(user, trip.id), 'Viaje completado.')}
          >
            <Spinner show={pending === 'complete'} />
            {trip.kind === 'weekly' ? 'Terminar la semana' : 'Completar viaje'}
          </Button>
        )}
      </div>
    </div>
  )
}

function MeetingPointEditor({ user, trip }: { user: User; trip: TripView }) {
  const [meetingPoint, setMeetingPoint] = useState(trip.meetingPoint ?? '')
  const { pending, run } = useAction()
  const unchanged = meetingPoint.trim() === (trip.meetingPoint ?? '')

  return (
    <section aria-labelledby="meeting-point-editor-title" className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <Label id="meeting-point-editor-title" htmlFor="meeting-point-editor" className="text-sm font-semibold">
        Punto de encuentro
      </Label>
      <Input
        id="meeting-point-editor"
        value={meetingPoint}
        onChange={(event) => setMeetingPoint(event.target.value)}
        placeholder="Ej. entrada principal de la Anáhuac"
        maxLength={120}
        className="h-12 text-base md:text-base"
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Usa un lugar público. Este dato solo se comparte con tus pasajeros aceptados; no pongas tu domicilio.
      </p>
      <Button
        variant="outline"
        className="h-11"
        disabled={!!pending || meetingPoint.trim().length < 3 || meetingPoint.trim().length > 120 || unchanged}
        onClick={() =>
          run(
            'meeting-point',
            () => tripService.setMeetingPoint(user, trip.id, meetingPoint),
            trip.meetingPoint ? 'Punto de encuentro actualizado.' : 'Punto de encuentro guardado.',
          )
        }
      >
        <Spinner show={pending === 'meeting-point'} />
        {trip.meetingPoint ? 'Actualizar punto de encuentro' : 'Guardar punto de encuentro'}
      </Button>
    </section>
  )
}

function PassengerActions({ user, trip }: { user: User; trip: TripView }) {
  const { pending, run } = useAction()
  const [open, setOpen] = useState(false)
  const [consent, setConsent] = useState(false)
  const req = trip.myRequest
  const weekly = trip.kind === 'weekly'
  const canRequest =
    trip.storedStatus === 'publicado' && trip.seatsAvailable > 0 && (!req || req.status === 'cancelled' || req.status === 'rejected')

  async function confirmRequest() {
    await run(
      'request',
      async () => {
        await tripService.requestSeat(user, trip.id, consent)
        setOpen(false)
        setConsent(false)
      },
      'Solicitud enviada al conductor.',
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {req?.status === 'rejected' && (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">El conductor no pudo aceptar tu solicitud anterior.</p>
      )}
      {canRequest && (
        <Button className="h-12 text-base" onClick={() => setOpen(true)}>
          {weekly ? 'Solicitar unirme a su semana' : 'Solicitar lugar'}
        </Button>
      )}
      {trip.storedStatus === 'publicado' && trip.seatsAvailable === 0 && !req && (
        <p className="rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground">Este viaje ya está lleno.</p>
      )}
      {req && (req.status === 'pending' || req.status === 'accepted') && trip.storedStatus === 'publicado' && (
        <Button
          variant="outline"
          className="h-12 text-base"
          disabled={!!pending}
          onClick={() => run('cancel-req', () => tripService.cancelRequest(user, req.id), 'Solicitud cancelada.')}
        >
          <Spinner show={pending === 'cancel-req'} />
          {req.status === 'pending' ? 'Cancelar solicitud' : weekly ? 'Ya no voy en esta semana' : 'Ya no voy en este viaje'}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{weekly ? 'Unirme a su semana' : 'Solicitar lugar'}</DialogTitle>
            <DialogDescription className="leading-relaxed">
              {weekly
                ? 'Pides un lugar para toda la semana, en los días y horas que publicó. Si el conductor acepta, verá tu nombre completo, foto y colonia, y tú verás el punto de encuentro.'
                : 'Si el conductor acepta, verá tu nombre completo, foto y colonia. Tú verás el punto de encuentro y la hora de recogida.'}{' '}
              Nunca compartimos tu dirección.
            </DialogDescription>
          </DialogHeader>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-relaxed">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            Acepto compartir estos datos con el conductor solo para {weekly ? 'estos viajes' : 'este viaje'}.
          </label>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Volver
            </Button>
            <Button className="h-11" disabled={!consent || !!pending} onClick={confirmRequest}>
              <Spinner show={pending === 'request'} />
              Enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
