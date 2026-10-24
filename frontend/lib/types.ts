export const COLONIAS = [
  'Montebello',
  'Altabrisa',
  'Cholul',
  'Francisco de Montejo',
  'Gran Santa Fe',
  'García Ginerés',
  'Temozón Norte',
  'Las Américas',
  'Caucel',
  'Centro',
] as const

export type Colonia = (typeof COLONIAS)[number]

export type UserMode = 'conductor' | 'pasajero'

/** Full user record. Only ever returned to its owner. */
export interface User {
  id: string
  email: string
  fullName: string
  /** 10-digit mobile number. Accounts created before it was required may not have it. */
  phone?: string
  photoUrl?: string
  colonia: Colonia
  activeMode: UserMode
  verified: boolean
  privacyAcceptedAt: string
  createdAt: string
}

/** Minimal profile that other students may see, depending on trip stage. */
export interface PublicProfile {
  id: string
  displayName: string
  photoUrl?: string
  colonia: Colonia
}

/**
 * Viewer-facing lifecycle:
 * Publicado → Solicitud pendiente → Aceptado → En curso → Finalizado (or Cancelado).
 */
export type TripStatus =
  | 'publicado'
  | 'solicitud_pendiente'
  | 'aceptado'
  | 'en_curso'
  | 'finalizado'
  | 'cancelado'

/** The status actually persisted on the trip record. */
export type StoredTripStatus = Extract<TripStatus, 'publicado' | 'en_curso' | 'finalizado' | 'cancelado'>

export type MeetingPointKind = 'plaza' | 'parque' | 'referencia'

export interface MeetingPoint {
  id: string
  colonia: Colonia
  name: string
  description: string
  kind: MeetingPointKind
}

export interface Trip {
  id: string
  driverId: string
  originColonia: Colonia
  destination: string
  routeDescription: string
  /** ISO 8601 in UTC, e.g. "2026-10-26T13:30:00.000Z". */
  departureTime: string
  seatsTotal: number
  seatsAvailable: number
  meetingPointId: string
  status: StoredTripStatus
  createdAt: string
}

export type SeatRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'

export interface SeatRequest {
  id: string
  tripId: string
  passengerId: string
  status: SeatRequestStatus
  consentGivenAt: string
  createdAt: string
  updatedAt: string
}

export type TripRole = 'conductor' | 'pasajero' | 'ninguno'

export interface TripRequestView {
  id: string
  status: SeatRequestStatus
  passenger: PublicProfile
}

/** Sanitized trip returned to a specific viewer. Fields are omitted when not allowed. */
export interface TripView {
  id: string
  driver: PublicProfile
  originColonia: Colonia
  destination: string
  routeDescription: string
  departureTime: string
  /** Local YYYY-MM-DD, derived from departureTime for display. */
  date: string
  /** Local HH:mm, derived from departureTime for display. */
  time: string
  seatsTotal: number
  seatsAvailable: number
  status: TripStatus
  storedStatus: StoredTripStatus
  myRole: TripRole
  myRequest?: { id: string; status: SeatRequestStatus }
  /** Only present for participants while the trip is active (Aceptado / En curso). */
  meetingPoint?: MeetingPoint
  pickupTime?: string
  /** Only present for the driver. */
  requests?: TripRequestView[]
}

export type ZoneId = 'A' | 'B' | 'C' | 'D'

export interface ParkingZone {
  id: ZoneId
  name: string
  area: string
  capacity: number
  entranceCounterId: string
  exitCounterId: string
}

/** Manual check-in/out made by a student. Private to that student. */
export interface ParkingEvent {
  id: string
  userId: string
  zoneId: ZoneId
  type: 'entrada' | 'salida'
  timestamp: string
}

export type SensorType = 'entrada' | 'salida'

export interface SensorEvent {
  id: string
  zoneId: ZoneId
  sensorType: SensorType
  timestamp: string
  counterId: string
}

export interface SensorStatus {
  zoneId: ZoneId
  online: boolean
  lastEventAt: string
}

export interface Schedule {
  id: string
  userId: string
  /** 0 = domingo … 6 = sábado */
  weekday: number
  start: string
  end: string
  building: string
  subject?: string
}

export type DataSource = 'verificado' | 'estimado' | 'simulado'

export type TrafficLight = 'verde' | 'amarillo' | 'rojo'

export interface ZoneOccupancy {
  zone: ParkingZone
  occupied: number
  percentage: number
  light: TrafficLight
  source: DataSource
  sensorStatus: SensorStatus
  sensorOccupied: number
  manualEstimate: number
  inReview: boolean
}

export interface ForecastPoint {
  minutes: number
  label: string
  percentage: number
  light: TrafficLight
}

export interface ZoneForecast {
  zoneId: ZoneId
  weekday: number
  points: ForecastPoint[]
  source: DataSource
}
