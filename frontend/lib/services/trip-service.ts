import { DEFAULT_DESTINATION } from '../config'
import { localDateOf, localTimeOf, timeToMinutes, toDepartureTime, toIsoDate } from '../format'
import { notifyChange } from '../mock/db'
import {
  type Colonia,
  type PublicProfile,
  type SeatRequestStatus,
  type StoredTripStatus,
  type TripStatus,
  type TripView,
  type User,
} from '../types'
import { api } from './api'
import { ServiceError } from './errors'

export interface TripFilters {
  origin?: string
  /** Minutes since midnight, inclusive. */
  fromMinutes?: number
  toMinutes?: number
}

export interface PublishTripInput {
  originColonia: string
  destination: string
  routeDescription: string
  date: string
  time: string
  seatsTotal: number
  meetingPoint?: string
}

/** A weekly trip takes its days and times from the driver's class schedule. */
export type PublishWeeklyTripInput = Omit<PublishTripInput, 'date' | 'time'>

// Shapes returned by the API (docs/api.md). Visibility rules are applied by the Lambda:
// the meeting point and full names only arrive when the viewer is allowed to see them.
interface ApiProfile {
  id: string
  name: string
  colonia?: Colonia
  photoUrl?: string
  phone?: string
}

interface ApiRequest {
  tripId: string
  passengerId: string
  status: SeatRequestStatus
  passenger?: ApiProfile | null
}

interface ApiTrip {
  tripId: string
  driverId: string
  driver: ApiProfile | null
  colonia: string
  destination?: string
  routeDescription?: string
  departureTime: string
  kind?: 'weekly'
  /** Weekly trips only. day: 1 = lunes … 7 = domingo. */
  days?: { day: number; arriveBy: string; leaveAt: string }[]
  seatsTotal: number
  seatsLeft: number
  /** Public meeting point, visible to the driver and accepted passengers. */
  meetingPoint?: string
  status: 'Disponible' | 'En curso' | 'Finalizado' | 'Cancelado'
  myRequest?: ApiRequest | null
  requests?: ApiRequest[]
}

const STORED_STATUS: Record<ApiTrip['status'], StoredTripStatus> = {
  Disponible: 'publicado',
  'En curso': 'en_curso',
  Finalizado: 'finalizado',
  Cancelado: 'cancelado',
}

// Seat requests are keyed by trip + passenger in DynamoDB; the UI works with a single id.
function requestIdOf(r: Pick<ApiRequest, 'tripId' | 'passengerId'>): string {
  return `${r.tripId}~${r.passengerId}`
}

function parseRequestId(id: string): { tripId: string; passengerId: string } {
  const [tripId, passengerId] = id.split('~')
  if (!tripId || !passengerId) throw new ServiceError('NOT_FOUND', 'La solicitud ya no existe.')
  return { tripId, passengerId }
}

function profileOf(profile: ApiProfile | null | undefined): PublicProfile {
  if (!profile) return { id: 'deleted', displayName: 'Cuenta eliminada', colonia: 'Centro' }
  return {
    id: profile.id,
    displayName: profile.name,
    photoUrl: profile.photoUrl,
    colonia: profile.colonia ?? 'Centro',
    phone: profile.phone,
  }
}

function deriveStatus(
  stored: StoredTripStatus,
  role: TripView['myRole'],
  requests: ApiRequest[],
  myRequest?: ApiRequest,
): TripStatus {
  if (stored === 'cancelado') return 'cancelado'
  // Keep trips from the old start/finish flow readable without exposing that extra step.
  if (stored === 'en_curso') return 'aceptado'
  if (role === 'conductor') {
    if (stored === 'finalizado') return 'finalizado'
    if (requests.some((r) => r.status === 'accepted')) return 'aceptado'
    if (requests.some((r) => r.status === 'pending')) return 'solicitud_pendiente'
    return 'publicado'
  }
  if (role === 'pasajero' && myRequest) {
    if (myRequest.status === 'accepted') {
      if (stored === 'finalizado') return 'finalizado'
      return 'aceptado'
    }
    if (myRequest.status === 'pending') return stored === 'publicado' ? 'solicitud_pendiente' : 'cancelado'
  }
  return stored
}

function toView(trip: ApiTrip, viewer: User): TripView {
  const stored = STORED_STATUS[trip.status]
  const isDriver = trip.driverId === viewer.id
  const myRequest = isDriver ? undefined : (trip.myRequest ?? undefined)
  const role: TripView['myRole'] = isDriver ? 'conductor' : myRequest ? 'pasajero' : 'ninguno'
  const requests = trip.requests ?? []

  const view: TripView = {
    id: trip.tripId,
    kind: trip.kind === 'weekly' ? 'weekly' : 'single',
    days: trip.days
      ?.map((d) => ({ weekday: d.day % 7, arriveBy: d.arriveBy, leaveAt: d.leaveAt }))
      .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)),
    driver: profileOf(trip.driver),
    originColonia: trip.colonia,
    destination: trip.destination ?? DEFAULT_DESTINATION,
    routeDescription: trip.routeDescription ?? '',
    departureTime: trip.departureTime,
    date: localDateOf(trip.departureTime),
    time: localTimeOf(trip.departureTime),
    seatsTotal: trip.seatsTotal,
    seatsAvailable: trip.seatsLeft,
    status: deriveStatus(stored, role, requests, myRequest),
    storedStatus: stored,
    myRole: role,
    myRequest: myRequest ? { id: requestIdOf(myRequest), status: myRequest.status } : undefined,
  }

  if (trip.meetingPoint && (stored === 'publicado' || stored === 'en_curso')) {
    view.meetingPoint = trip.meetingPoint
    if (view.kind === 'single') view.pickupTime = view.time
  }

  if (isDriver) {
    view.requests = requests
      .filter((r) => r.status === 'pending' || r.status === 'accepted')
      .map((r) => ({ id: requestIdOf(r), status: r.status, passenger: profileOf(r.passenger) }))
  }

  return view
}

function sortByDateTime(a: TripView, b: TripView) {
  return Date.parse(a.departureTime) - Date.parse(b.departureTime)
}

/** Runs a change against the API, then refreshes every screen. */
async function mutate<T>(request: Promise<T>): Promise<T> {
  const result = await request
  notifyChange()
  return result
}

/** Validates the fields both kinds of trip share and returns them as the API expects. */
function tripBody(input: PublishWeeklyTripInput) {
  const origin = input.originColonia.trim()
  if (origin.length < 2 || origin.length > 80) throw new ServiceError('INVALID_INPUT', 'Escribe un lugar de salida (máximo 80 caracteres).')
  const destination = input.destination.trim()
  if (destination.length < 2 || destination.length > 80) throw new ServiceError('INVALID_INPUT', 'Escribe un destino (máximo 80 caracteres).')
  const meetingPoint = input.meetingPoint?.trim()
  if (meetingPoint && meetingPoint.length > 120) throw new ServiceError('INVALID_INPUT', 'El punto de encuentro no debe pasar de 120 caracteres.')
  if (!Number.isInteger(input.seatsTotal) || input.seatsTotal < 1 || input.seatsTotal > 4) {
    throw new ServiceError('INVALID_INPUT', 'Puedes ofrecer de 1 a 4 lugares.')
  }
  const route = input.routeDescription.trim()
  if (route.length > 140) throw new ServiceError('INVALID_INPUT', 'La ruta no debe pasar de 140 caracteres.')
  return {
    colonia: origin,
    destination,
    routeDescription: route || undefined,
    seatsTotal: input.seatsTotal,
    meetingPoint: meetingPoint || undefined,
  }
}

export const tripService = {
  /** Passengers search without sharing any location. */
  async listAvailable(user: User, filters: TripFilters = {}): Promise<TripView[]> {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const params = new URLSearchParams({ from: startOfToday.toISOString() })
    const trips = await api<ApiTrip[]>(`/trips?${params}`)
    const origin = filters.origin?.trim().toLocaleLowerCase()
    return trips
      .map((t) => toView(t, user))
      .filter((t) => {
        if (origin && !t.originColonia.toLocaleLowerCase().includes(origin)) return false
        // A weekly trip matches when any of its days arrives at the university in the range.
        const times = t.kind === 'weekly' ? (t.days ?? []).map((d) => d.arriveBy) : [t.time]
        return times.some((time) => {
          const m = timeToMinutes(time)
          if (filters.fromMinutes !== undefined && m < filters.fromMinutes) return false
          if (filters.toMinutes !== undefined && m > filters.toMinutes) return false
          return true
        })
      })
      .sort(sortByDateTime)
  },

  async listMine(user: User): Promise<TripView[]> {
    const { asDriver, asPassenger } = await api<{ asDriver: ApiTrip[]; asPassenger: ApiTrip[] }>('/me/trips')
    return [...asDriver, ...asPassenger].map((t) => toView(t, user)).sort(sortByDateTime)
  },

  async getNextTrip(user: User): Promise<TripView | null> {
    const mine = await this.listMine(user)
    const active = mine.filter((t) => ['publicado', 'solicitud_pendiente', 'aceptado'].includes(t.status))
    const relevant = active.filter((t) => t.myRole === 'conductor' || t.status !== 'publicado')
    return relevant[0] ?? null
  },

  async getTrip(user: User, tripId: string): Promise<TripView | null> {
    try {
      return toView(await api<ApiTrip>(`/trips/${encodeURIComponent(tripId)}`), user)
    } catch (error) {
      // Missing trips, and closed trips the viewer never joined, both come back as 404.
      if (error instanceof ServiceError && error.code === 'NOT_FOUND') return null
      throw error
    }
  },

  async publishTrip(user: User, input: PublishTripInput): Promise<TripView> {
    const body = tripBody(input)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < toIsoDate(new Date())) {
      throw new ServiceError('INVALID_INPUT', 'Elige una fecha de hoy en adelante.')
    }
    if (!/^\d{2}:\d{2}$/.test(input.time)) throw new ServiceError('INVALID_INPUT', 'Elige una hora válida.')
    const trip = await mutate(
      api<ApiTrip>('/trips', {
        method: 'POST',
        body: { ...body, departureTime: toDepartureTime(input.date, input.time) },
      }),
    )
    return toView(trip, user)
  },

  /** Publishes the driver's whole week: the Lambda reads their schedule, but only shares arrival and departure times. */
  async publishWeeklyTrip(user: User, input: PublishWeeklyTripInput): Promise<TripView> {
    const trip = await mutate(api<ApiTrip>('/trips', { method: 'POST', body: { ...tripBody(input), kind: 'weekly' } }))
    return toView(trip, user)
  },

  /** Requires explicit consent. Shares only name, photo and colonia with the driver. */
  async requestSeat(user: User, tripId: string, consent: boolean): Promise<void> {
    if (!consent) throw new ServiceError('INVALID_INPUT', 'Necesitamos tu consentimiento para enviar la solicitud.')
    await mutate(api(`/trips/${encodeURIComponent(tripId)}/requests`, { method: 'POST', body: { consent: true } }))
  },

  /** Cancelling revokes consent: the driver stops seeing the passenger's profile. */
  async cancelRequest(user: User, requestId: string): Promise<void> {
    const { tripId } = parseRequestId(requestId)
    await mutate(api(`/trips/${encodeURIComponent(tripId)}/requests`, { method: 'DELETE' }))
  },

  async respondToRequest(user: User, requestId: string, accept: boolean): Promise<void> {
    const { tripId, passengerId } = parseRequestId(requestId)
    // The Lambda accepts inside a DynamoDB transaction, so two accepts can never overbook the car.
    const action = accept ? 'accept' : 'reject'
    await mutate(
      api(`/trips/${encodeURIComponent(tripId)}/requests/${encodeURIComponent(passengerId)}/${action}`, { method: 'POST' }),
    )
  },

  async setMeetingPoint(user: User, tripId: string, meetingPoint: string): Promise<void> {
    const point = meetingPoint.trim()
    if (point.length < 3 || point.length > 120) {
      throw new ServiceError('INVALID_INPUT', 'Escribe un punto público de encuentro (de 3 a 120 caracteres).')
    }
    await mutate(
      api(`/trips/${encodeURIComponent(tripId)}/meeting-point`, {
        method: 'PUT',
        body: { meetingPoint: point },
      }),
    )
  },

  async completeTrip(user: User, tripId: string): Promise<void> {
    await mutate(api(`/trips/${encodeURIComponent(tripId)}/status`, { method: 'POST', body: { status: 'Finalizado' } }))
  },

  async cancelTrip(user: User, tripId: string): Promise<void> {
    await mutate(api(`/trips/${encodeURIComponent(tripId)}/status`, { method: 'POST', body: { status: 'Cancelado' } }))
  },
}
