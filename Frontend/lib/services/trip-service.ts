import { DEFAULT_DESTINATION, getMeetingPoint } from '../config'
import { firstName, localDateOf, localTimeOf, timeToMinutes, toDepartureTime, toIsoDate } from '../format'
import { createId, readDb, writeDb } from '../mock/db'
import type { DbState, StoredUser } from '../mock/seed'
import {
  COLONIAS,
  type Colonia,
  type PublicProfile,
  type SeatRequest,
  type Trip,
  type TripStatus,
  type TripView,
  type User,
} from '../types'
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

function profileOf(user: StoredUser | undefined, detail: 'basic' | 'match'): PublicProfile {
  if (!user) return { id: 'deleted', displayName: 'Cuenta eliminada', colonia: 'Centro' }
  return {
    id: user.id,
    // Before a match only the first name is shown; after a request both see the basic profile.
    displayName: detail === 'match' ? user.fullName : firstName(user.fullName),
    photoUrl: user.photoUrl,
    colonia: user.colonia,
  }
}

function activeRequestFor(db: DbState, tripId: string, userId: string): SeatRequest | undefined {
  const mine = db.requests
    .filter((r) => r.tripId === tripId && r.passengerId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return mine[0]
}

function deriveStatus(trip: Trip, role: TripView['myRole'], db: DbState, myRequest?: SeatRequest): TripStatus {
  if (trip.status === 'cancelado') return 'cancelado'
  if (role === 'conductor') {
    if (trip.status !== 'publicado') return trip.status
    const reqs = db.requests.filter((r) => r.tripId === trip.id)
    if (reqs.some((r) => r.status === 'accepted')) return 'aceptado'
    if (reqs.some((r) => r.status === 'pending')) return 'solicitud_pendiente'
    return 'publicado'
  }
  if (role === 'pasajero' && myRequest) {
    if (myRequest.status === 'accepted') {
      if (trip.status === 'en_curso') return 'en_curso'
      if (trip.status === 'finalizado') return 'finalizado'
      return 'aceptado'
    }
    if (myRequest.status === 'pending') return trip.status === 'publicado' ? 'solicitud_pendiente' : 'cancelado'
  }
  return trip.status
}

/**
 * Central visibility rule. In production this logic runs inside the Lambda behind a Cognito
 * authorizer, so the client never receives fields it is not allowed to see.
 */
function toView(trip: Trip, viewer: User, db: DbState): TripView {
  const driver = db.users.find((u) => u.id === trip.driverId)
  const isDriver = trip.driverId === viewer.id
  const myRequest = isDriver ? undefined : activeRequestFor(db, trip.id, viewer.id)
  const role: TripView['myRole'] = isDriver ? 'conductor' : myRequest ? 'pasajero' : 'ninguno'
  const status = deriveStatus(trip, role, db, myRequest)

  const hasMatch = isDriver || (myRequest && (myRequest.status === 'pending' || myRequest.status === 'accepted'))
  const isParticipant = isDriver || myRequest?.status === 'accepted'
  const meetingVisible = isParticipant && (trip.status === 'publicado' || trip.status === 'en_curso')

  const view: TripView = {
    id: trip.id,
    driver: profileOf(driver, hasMatch ? 'match' : 'basic'),
    originColonia: trip.originColonia,
    destination: trip.destination,
    routeDescription: trip.routeDescription,
    departureTime: trip.departureTime,
    date: localDateOf(trip.departureTime),
    time: localTimeOf(trip.departureTime),
    seatsTotal: trip.seatsTotal,
    seatsAvailable: trip.seatsAvailable,
    status,
    storedStatus: trip.status,
    myRole: role,
    myRequest: myRequest ? { id: myRequest.id, status: myRequest.status } : undefined,
  }

  if (meetingVisible) {
    view.meetingPoint = getMeetingPoint(trip.meetingPointId)
    view.pickupTime = view.time
  }

  if (isDriver) {
    view.requests = db.requests
      .filter((r) => r.tripId === trip.id && (r.status === 'pending' || r.status === 'accepted'))
      .map((r) => ({
        id: r.id,
        status: r.status,
        passenger: profileOf(
          db.users.find((u) => u.id === r.passengerId),
          'match',
        ),
      }))
  }

  return view
}

function sortByDateTime(a: Trip, b: Trip) {
  return Date.parse(a.departureTime) - Date.parse(b.departureTime)
}

function requireTrip(db: DbState, tripId: string): Trip {
  const trip = db.trips.find((t) => t.id === tripId)
  if (!trip) throw new ServiceError('NOT_FOUND', 'Este viaje ya no existe.')
  return trip
}

function requireDriver(trip: Trip, user: User) {
  // Cognito authorizer + Lambda check: only the trip owner may change it.
  if (trip.driverId !== user.id) throw new ServiceError('FORBIDDEN', 'Solo el conductor puede hacer esto.')
}

export const tripService = {
  /** Passengers search without sharing any location. */
  async listAvailable(user: User, filters: TripFilters = {}): Promise<TripView[]> {
    const db = readDb()
    const today = toIsoDate(new Date())
    return db.trips
      .filter((t) => t.status === 'publicado' && t.driverId !== user.id && localDateOf(t.departureTime) >= today)
      .filter((t) => !filters.colonia || t.originColonia === filters.colonia)
      .filter((t) => {
        const m = timeToMinutes(localTimeOf(t.departureTime))
        if (filters.fromMinutes !== undefined && m < filters.fromMinutes) return false
        if (filters.toMinutes !== undefined && m > filters.toMinutes) return false
        return true
      })
      .sort(sortByDateTime)
      .map((t) => toView(t, user, db))
  },

  async listMine(user: User): Promise<TripView[]> {
    const db = readDb()
    const requestedIds = new Set(db.requests.filter((r) => r.passengerId === user.id).map((r) => r.tripId))
    return db.trips
      .filter((t) => t.driverId === user.id || requestedIds.has(t.id))
      .sort(sortByDateTime)
      .map((t) => toView(t, user, db))
  },

  async getNextTrip(user: User): Promise<TripView | null> {
    const mine = await this.listMine(user)
    const active = mine.filter((t) => ['publicado', 'solicitud_pendiente', 'aceptado', 'en_curso'].includes(t.status))
    const relevant = active.filter((t) => t.myRole === 'conductor' || t.status !== 'publicado')
    const ongoing = relevant.find((t) => t.status === 'en_curso')
    return ongoing ?? relevant[0] ?? null
  },

  async getTrip(user: User, tripId: string): Promise<TripView | null> {
    const db = readDb()
    const trip = db.trips.find((t) => t.id === tripId)
    if (!trip) return null
    const view = toView(trip, user, db)
    // Non-participants may only see trips that are still open for requests.
    if (view.myRole === 'ninguno' && trip.status !== 'publicado') return null
    return view
  },

  async publishTrip(user: User, input: PublishTripInput): Promise<TripView> {
    if (!COLONIAS.includes(input.originColonia)) throw new ServiceError('INVALID_INPUT', 'Selecciona una colonia de origen.')
    const meetingPoint = getMeetingPoint(input.meetingPointId)
    // Only points from the configured public list are accepted; free-text addresses are rejected.
    if (!meetingPoint || meetingPoint.colonia !== input.originColonia) {
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

    const trip: Trip = {
      id: createId('t'),
      driverId: user.id,
      originColonia: input.originColonia,
      destination: DEFAULT_DESTINATION,
      routeDescription: route.slice(0, 140),
      departureTime: toDepartureTime(input.date, input.time),
      seatsTotal: input.seatsTotal,
      seatsAvailable: input.seatsTotal,
      meetingPointId: meetingPoint.id,
      status: 'publicado',
      createdAt: new Date().toISOString(),
    }
    return writeDb((db) => {
      db.trips.push(trip)
      return toView(trip, user, db)
    })
  },

  /** Requires explicit consent. Shares only name, photo and colonia with the driver. */
  async requestSeat(user: User, tripId: string, consent: boolean): Promise<void> {
    if (!consent) throw new ServiceError('INVALID_INPUT', 'Necesitamos tu consentimiento para enviar la solicitud.')
    writeDb((db) => {
      const trip = requireTrip(db, tripId)
      if (trip.driverId === user.id) throw new ServiceError('FORBIDDEN', 'No puedes solicitar lugar en tu propio viaje.')
      if (trip.status !== 'publicado') throw new ServiceError('CONFLICT', 'Este viaje ya no acepta solicitudes.')
      if (trip.seatsAvailable <= 0) throw new ServiceError('CONDITIONAL_CHECK_FAILED', 'Ya no hay lugares disponibles.')
      const existing = activeRequestFor(db, tripId, user.id)
      if (existing && (existing.status === 'pending' || existing.status === 'accepted')) {
        throw new ServiceError('CONFLICT', 'Ya tienes una solicitud en este viaje.')
      }
      const now = new Date().toISOString()
      db.requests.push({ id: createId('r'), tripId, passengerId: user.id, status: 'pending', consentGivenAt: now, createdAt: now, updatedAt: now })
    })
  },

  /** Cancelling revokes consent: the driver stops seeing the passenger's profile. */
  async cancelRequest(user: User, requestId: string): Promise<void> {
    writeDb((db) => {
      const request = db.requests.find((r) => r.id === requestId)
      if (!request || request.passengerId !== user.id) throw new ServiceError('FORBIDDEN', 'No puedes modificar esta solicitud.')
      if (request.status !== 'pending' && request.status !== 'accepted') return
      const trip = requireTrip(db, request.tripId)
      if (trip.status !== 'publicado') throw new ServiceError('CONFLICT', 'El viaje ya comenzó o terminó.')
      if (request.status === 'accepted') trip.seatsAvailable = Math.min(trip.seatsTotal, trip.seatsAvailable + 1)
      request.status = 'cancelled'
      request.updatedAt = new Date().toISOString()
    })
  },

  async respondToRequest(user: User, requestId: string, accept: boolean): Promise<void> {
    writeDb((db) => {
      const request = db.requests.find((r) => r.id === requestId)
      if (!request) throw new ServiceError('NOT_FOUND', 'La solicitud ya no existe.')
      const trip = requireTrip(db, request.tripId)
      requireDriver(trip, user)
      if (request.status !== 'pending') throw new ServiceError('CONFLICT', 'Esta solicitud ya fue respondida o cancelada.')
      if (trip.status !== 'publicado') throw new ServiceError('CONFLICT', 'El viaje ya no acepta cambios.')

      if (accept) {
        // Atomic seat decrement. In production this becomes a DynamoDB conditional write:
        //   UpdateExpression: 'SET seatsAvailable = seatsAvailable - :one'
        //   ConditionExpression: 'seatsAvailable > :zero AND #status = :publicado'
        // wrapped in TransactWriteItems together with the request status update,
        // so two concurrent accepts can never overbook the car.
        if (trip.seatsAvailable <= 0) {
          throw new ServiceError('CONDITIONAL_CHECK_FAILED', 'Ya no quedan lugares disponibles en este viaje.')
        }
        trip.seatsAvailable -= 1
        request.status = 'accepted'
      } else {
        request.status = 'rejected'
      }
      request.updatedAt = new Date().toISOString()
    })
  },

  async startTrip(user: User, tripId: string): Promise<void> {
    writeDb((db) => {
      const trip = requireTrip(db, tripId)
      requireDriver(trip, user)
      if (trip.status !== 'publicado') throw new ServiceError('CONFLICT', 'Solo puedes iniciar un viaje publicado.')
      trip.status = 'en_curso'
      // Pending requests expire once the trip starts.
      for (const r of db.requests) {
        if (r.tripId === trip.id && r.status === 'pending') {
          r.status = 'rejected'
          r.updatedAt = new Date().toISOString()
        }
      }
    })
  },

  async finishTrip(user: User, tripId: string): Promise<void> {
    writeDb((db) => {
      const trip = requireTrip(db, tripId)
      requireDriver(trip, user)
      if (trip.status !== 'en_curso') throw new ServiceError('CONFLICT', 'Primero marca el viaje como En curso.')
      trip.status = 'finalizado'
    })
  },

  async cancelTrip(user: User, tripId: string): Promise<void> {
    writeDb((db) => {
      const trip = requireTrip(db, tripId)
      requireDriver(trip, user)
      if (trip.status !== 'publicado') throw new ServiceError('CONFLICT', 'Solo puedes cancelar un viaje que no ha comenzado.')
      trip.status = 'cancelado'
    })
  },
}
