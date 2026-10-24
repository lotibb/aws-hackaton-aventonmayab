import { NEARBY_KM, findColonia } from '../colonias'
import { DEFAULT_DESTINATION, getMeetingPoint, meetingPointsNear } from '../config'
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
  colonia?: Colonia
  /** Minutes since midnight, inclusive. */
  fromMinutes?: number
  toMinutes?: number
}

export interface PublishTripInput {
  originColonia: Colonia
  routeDescription: string
  date: string
  time: string
  seatsTotal: number
  meetingPointId: string
}

// Shapes returned by the API (docs/api.md). Visibility rules are applied by the Lambda:
// the meeting point and full names only arrive when the viewer is allowed to see them.
interface ApiProfile {
  id: string
  name: string
  colonia?: Colonia
  photoUrl?: string
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
  colonia: Colonia
  destination?: string
  routeDescription?: string
  departureTime: string
  seatsTotal: number
  seatsLeft: number
  /** Only in nearby searches: km from the searched colonia. */
  distanceKm?: number
  /** Id of a public meeting point from config. */
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
  }
}

function deriveStatus(
  stored: StoredTripStatus,
  role: TripView['myRole'],
  requests: ApiRequest[],
  myRequest?: ApiRequest,
): TripStatus {
  if (stored === 'cancelado') return 'cancelado'
  if (role === 'conductor') {
    if (stored !== 'publicado') return stored
    if (requests.some((r) => r.status === 'accepted')) return 'aceptado'
    if (requests.some((r) => r.status === 'pending')) return 'solicitud_pendiente'
    return 'publicado'
  }
  if (role === 'pasajero' && myRequest) {
    if (myRequest.status === 'accepted') {
      if (stored === 'en_curso') return 'en_curso'
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
    driver: profileOf(trip.driver),
    originColonia: trip.colonia,
    destination: trip.destination ?? DEFAULT_DESTINATION,
    routeDescription: trip.routeDescription ?? '',
    departureTime: trip.departureTime,
    date: localDateOf(trip.departureTime),
    time: localTimeOf(trip.departureTime),
    seatsTotal: trip.seatsTotal,
    seatsAvailable: trip.seatsLeft,
    distanceKm: trip.distanceKm,
    status: deriveStatus(stored, role, requests, myRequest),
    storedStatus: stored,
    myRole: role,
    myRequest: myRequest ? { id: requestIdOf(myRequest), status: myRequest.status } : undefined,
  }

  const meetingPoint = trip.meetingPoint ? getMeetingPoint(trip.meetingPoint) : undefined
  if (meetingPoint && (stored === 'publicado' || stored === 'en_curso')) {
    view.meetingPoint = meetingPoint
    view.pickupTime = view.time
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

export const tripService = {
  /** Passengers search without sharing any location. */
  async listAvailable(user: User, filters: TripFilters = {}): Promise<TripView[]> {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const params = new URLSearchParams({ from: startOfToday.toISOString() })
    // A colonia filter means "trips leaving near it", not only from that exact colonia.
    const center = findColonia(filters.colonia)
    if (center) {
      params.set('lat', String(center.lat))
      params.set('lng', String(center.lng))
      params.set('radiusKm', String(NEARBY_KM))
    } else if (filters.colonia) {
      params.set('colonia', filters.colonia)
    }
    const trips = await api<ApiTrip[]>(`/trips?${params}`)
    return trips
      .map((t) => toView(t, user))
      .filter((t) => {
        const m = timeToMinutes(t.time)
        if (filters.fromMinutes !== undefined && m < filters.fromMinutes) return false
        if (filters.toMinutes !== undefined && m > filters.toMinutes) return false
        return true
      })
      .sort(sortByDateTime)
  },

  async listMine(user: User): Promise<TripView[]> {
    const { asDriver, asPassenger } = await api<{ asDriver: ApiTrip[]; asPassenger: ApiTrip[] }>('/me/trips')
    return [...asDriver, ...asPassenger].map((t) => toView(t, user)).sort(sortByDateTime)
  },

  async getNextTrip(user: User): Promise<TripView | null> {
    const mine = await this.listMine(user)
    const active = mine.filter((t) => ['publicado', 'solicitud_pendiente', 'aceptado', 'en_curso'].includes(t.status))
    const relevant = active.filter((t) => t.myRole === 'conductor' || t.status !== 'publicado')
    const ongoing = relevant.find((t) => t.status === 'en_curso')
    return ongoing ?? relevant[0] ?? null
  },

  async getTrip(user: User, tripId: string): Promise<TripView | null> {
    try {
      return toView(await api<ApiTrip>(`/trips/${encodeURIComponent(tripId)}`), user)
    } catch (error) {
      // Missing trips, and started trips the viewer never joined, both come back as 404.
      if (error instanceof ServiceError && error.code === 'NOT_FOUND') return null
      throw error
    }
  },

  async publishTrip(user: User, input: PublishTripInput): Promise<TripView> {
    const origin = findColonia(input.originColonia)
    if (!origin) throw new ServiceError('INVALID_INPUT', 'Selecciona una colonia de origen.')
    const meetingPoint = getMeetingPoint(input.meetingPointId)
    // Only the public points offered for this colonia are accepted; free-text addresses are rejected.
    if (!meetingPoint || !meetingPointsNear(input.originColonia).some((p) => p.id === meetingPoint.id)) {
      throw new ServiceError('INVALID_INPUT', 'Elige un punto de encuentro público de la lista.')
    }
    if (!Number.isInteger(input.seatsTotal) || input.seatsTotal < 1 || input.seatsTotal > 4) {
      throw new ServiceError('INVALID_INPUT', 'Puedes ofrecer de 1 a 4 lugares.')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < toIsoDate(new Date())) {
      throw new ServiceError('INVALID_INPUT', 'Elige una fecha de hoy en adelante.')
    }
    if (!/^\d{2}:\d{2}$/.test(input.time)) throw new ServiceError('INVALID_INPUT', 'Elige una hora válida.')
    const route = input.routeDescription.trim()
    if (route.length < 5) throw new ServiceError('INVALID_INPUT', 'Describe brevemente tu ruta (por ejemplo, avenidas principales).')

    const trip = await mutate(
      api<ApiTrip>('/trips', {
        method: 'POST',
        body: {
          colonia: input.originColonia,
          destination: DEFAULT_DESTINATION,
          routeDescription: route.slice(0, 140),
          departureTime: toDepartureTime(input.date, input.time),
          seatsTotal: input.seatsTotal,
          meetingPoint: meetingPoint.id,
          // The colonia's center, used to show the trip to passengers nearby.
          originLat: origin.lat,
          originLng: origin.lng,
        },
      }),
    )
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

  async startTrip(user: User, tripId: string): Promise<void> {
    await mutate(api(`/trips/${encodeURIComponent(tripId)}/status`, { method: 'POST', body: { status: 'En curso' } }))
  },

  async finishTrip(user: User, tripId: string): Promise<void> {
    await mutate(api(`/trips/${encodeURIComponent(tripId)}/status`, { method: 'POST', body: { status: 'Finalizado' } }))
  },

  async cancelTrip(user: User, tripId: string): Promise<void> {
    await mutate(api(`/trips/${encodeURIComponent(tripId)}/status`, { method: 'POST', body: { status: 'Cancelado' } }))
  },
}
