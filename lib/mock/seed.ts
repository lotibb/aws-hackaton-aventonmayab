import { DEFAULT_DESTINATION, PARKING_ZONES } from '../config'
import { addDays, minutesToTime, toDepartureTime, toIsoDate } from '../format'
import type {
  Colonia,
  ParkingEvent,
  Schedule,
  SeatRequest,
  SensorEvent,
  SensorStatus,
  Trip,
  User,
  ZoneId,
} from '../types'

/** Credentials live in Cognito; the mock only keeps profile data keyed by the Cognito `sub`. */
export type StoredUser = User

export interface DbState {
  users: StoredUser[]
  trips: Trip[]
  requests: SeatRequest[]
  schedules: Schedule[]
  parkingEvents: ParkingEvent[]
  sensorCounters: Record<ZoneId, { entries: number; exits: number }>
  sensorEvents: SensorEvent[]
  sensorStatus: Record<ZoneId, SensorStatus>
  /** Occupancy extrapolated from student check-ins and projections. */
  manualEstimates: Record<ZoneId, number>
}

const seedUsers: Array<[string, string, string, Colonia, string?]> = [
  ['u-ana', 'Ana Rodríguez Pérez', 'ana.rodriguez@anahuac.mx', 'Altabrisa', '/avatars/ana.png'],
  ['u-carlos', 'Carlos Méndez Ruiz', 'carlos.mendez@anahuac.mx', 'Montebello', '/avatars/carlos.png'],
  ['u-sofia', 'Sofía Castillo Vega', 'sofia.castillo@anahuac.mx', 'Cholul', '/avatars/sofia.png'],
  ['u-diego', 'Diego Herrera Solís', 'diego.herrera@anahuac.mx', 'García Ginerés', '/avatars/diego.png'],
  ['u-mariana', 'Mariana Pech Canul', 'mariana.pech@anahuac.mx', 'Gran Santa Fe'],
  ['u-jorge', 'Jorge Ramírez Ortiz', 'jorge.ramirez@anahuac.mx', 'Las Américas'],
  ['u-valeria', 'Valeria Gómez Novelo', 'valeria.gomez@anahuac.mx', 'Caucel'],
  ['u-luis', 'Luis Fernández Cámara', 'luis.fernandez@anahuac.mx', 'Francisco de Montejo'],
  ['u-regina', 'Regina Escalante Ruz', 'regina.escalante@anahuac.mx', 'Temozón Norte'],
  ['u-emilio', 'Emilio Baeza Torres', 'emilio.baeza@anahuac.mx', 'Centro'],
]

const scheduleTemplates: Array<Array<[number, string, string, string]>> = [
  [[1, '07:00', '08:30', 'Humanidades'], [3, '07:00', '08:30', 'Humanidades'], [1, '11:00', '12:30', 'Negocios'], [2, '09:00', '10:30', 'Negocios'], [4, '09:00', '10:30', 'Negocios'], [5, '08:00', '11:00', 'Biblioteca']],
  [[1, '07:00', '10:00', 'Ingenierías'], [2, '07:00', '09:00', 'Ingenierías'], [3, '07:00', '10:00', 'Ingenierías'], [4, '11:00', '13:00', 'Ingenierías'], [5, '07:00', '09:00', 'Ingenierías']],
  [[1, '08:00', '10:00', 'Ciencias de la Salud'], [2, '08:00', '12:00', 'Ciencias de la Salud'], [3, '08:00', '10:00', 'Ciencias de la Salud'], [4, '08:00', '12:00', 'Ciencias de la Salud'], [6, '09:00', '12:00', 'Ciencias de la Salud']],
  [[1, '09:00', '11:00', 'Arquitectura y Diseño'], [2, '11:00', '14:00', 'Arquitectura y Diseño'], [4, '11:00', '14:00', 'Arquitectura y Diseño'], [5, '09:00', '11:00', 'Arquitectura y Diseño']],
  [[1, '07:00', '09:00', 'Negocios'], [2, '07:00', '09:00', 'Negocios'], [3, '07:00', '09:00', 'Negocios'], [4, '07:00', '09:00', 'Negocios'], [5, '07:00', '09:00', 'Negocios']],
  [[1, '18:00', '21:00', 'Negocios'], [3, '18:00', '21:00', 'Negocios'], [6, '08:00', '13:00', 'Negocios']],
  [[2, '08:00', '11:00', 'Humanidades'], [4, '08:00', '11:00', 'Humanidades'], [5, '11:00', '13:00', 'Humanidades']],
  [[1, '07:00', '09:00', 'Ingenierías'], [1, '11:00', '13:00', 'Ingenierías'], [3, '07:00', '09:00', 'Ingenierías'], [3, '11:00', '13:00', 'Ingenierías']],
  [[2, '07:00', '10:00', 'Ciencias de la Salud'], [4, '07:00', '10:00', 'Ciencias de la Salud'], [5, '07:00', '09:00', 'Ciencias de la Salud']],
  [[1, '16:00', '19:00', 'Deportivo'], [2, '18:00', '21:00', 'Negocios'], [4, '18:00', '21:00', 'Negocios']],
]

export function createSeed(): DbState {
  const now = new Date()
  const nowIso = now.toISOString()
  const today = toIsoDate(now)
  const day = (n: number) => toIsoDate(addDays(now, n))
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startedAt = minutesToTime(Math.max(0, nowMinutes - 10)).padStart(5, '0')

  const users: StoredUser[] = seedUsers.map(([id, fullName, email, colonia, photoUrl]) => ({
    id,
    fullName,
    email,
    colonia,
    photoUrl,
    activeMode: 'pasajero',
    verified: true,
    privacyAcceptedAt: nowIso,
    createdAt: nowIso,
  }))

  const trip = ({ date, time, ...t }: Omit<Trip, 'destination' | 'createdAt' | 'departureTime'> & { date: string; time: string }): Trip => ({
    ...t,
    departureTime: toDepartureTime(date, time),
    destination: DEFAULT_DESTINATION,
    createdAt: nowIso,
  })

  const trips: Trip[] = [
    trip({ id: 't-1', driverId: 'u-carlos', originColonia: 'Montebello', routeDescription: 'Por Prolongación Montejo y Periférico Norte', date: day(1), time: '07:00', seatsTotal: 3, seatsAvailable: 3, meetingPointId: 'mp-montebello-1', status: 'publicado' }),
    trip({ id: 't-2', driverId: 'u-ana', originColonia: 'Altabrisa', routeDescription: 'Por Calle 20 hacia Periférico, sin desvíos', date: day(1), time: '07:15', seatsTotal: 3, seatsAvailable: 3, meetingPointId: 'mp-altabrisa-1', status: 'publicado' }),
    trip({ id: 't-3', driverId: 'u-sofia', originColonia: 'Cholul', routeDescription: 'Carretera Mérida–Cholul directo al campus', date: day(1), time: '06:50', seatsTotal: 2, seatsAvailable: 2, meetingPointId: 'mp-cholul-2', status: 'publicado' }),
    trip({ id: 't-4', driverId: 'u-diego', originColonia: 'García Ginerés', routeDescription: 'Paseo de Montejo y Prolongación hasta Periférico', date: day(1), time: '07:30', seatsTotal: 3, seatsAvailable: 1, meetingPointId: 'mp-gg-1', status: 'publicado' }),
    trip({ id: 't-5', driverId: 'u-ana', originColonia: 'Altabrisa', routeDescription: 'Por Calle 20 hacia Periférico', date: today, time: startedAt, seatsTotal: 3, seatsAvailable: 1, meetingPointId: 'mp-altabrisa-2', status: 'en_curso' }),
    trip({ id: 't-6', driverId: 'u-regina', originColonia: 'Temozón Norte', routeDescription: 'Por la carretera a Progreso y Periférico', date: day(-1), time: '07:00', seatsTotal: 3, seatsAvailable: 2, meetingPointId: 'mp-tn-1', status: 'finalizado' }),
    trip({ id: 't-7', driverId: 'u-jorge', originColonia: 'Las Américas', routeDescription: 'Por Avenida Las Américas y Periférico', date: day(1), time: '08:00', seatsTotal: 2, seatsAvailable: 1, meetingPointId: 'mp-la-1', status: 'cancelado' }),
    trip({ id: 't-8', driverId: 'u-valeria', originColonia: 'Caucel', routeDescription: 'Periférico Poniente rodeando por el norte', date: day(1), time: '06:40', seatsTotal: 2, seatsAvailable: 2, meetingPointId: 'mp-caucel-2', status: 'publicado' }),
    trip({ id: 't-9', driverId: 'u-luis', originColonia: 'Francisco de Montejo', routeDescription: 'Por Avenida Jacinto Canek y Periférico', date: day(1), time: '07:20', seatsTotal: 4, seatsAvailable: 3, meetingPointId: 'mp-fm-1', status: 'publicado' }),
    trip({ id: 't-10', driverId: 'u-emilio', originColonia: 'Centro', routeDescription: 'Por Paseo de Montejo, salida después de comer', date: day(2), time: '13:30', seatsTotal: 2, seatsAvailable: 2, meetingPointId: 'mp-centro-2', status: 'publicado' }),
    trip({ id: 't-11', driverId: 'u-mariana', originColonia: 'Gran Santa Fe', routeDescription: 'Por Calle 50 y Periférico Norte', date: day(2), time: '07:00', seatsTotal: 3, seatsAvailable: 3, meetingPointId: 'mp-gsf-1', status: 'publicado' }),
  ]

  const req = (id: string, tripId: string, passengerId: string, status: SeatRequest['status']): SeatRequest => ({
    id,
    tripId,
    passengerId,
    status,
    consentGivenAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  })

  const requests: SeatRequest[] = [
    req('r-1', 't-2', 'u-luis', 'pending'),
    req('r-2', 't-3', 'u-ana', 'pending'),
    req('r-3', 't-4', 'u-ana', 'accepted'),
    req('r-4', 't-4', 'u-valeria', 'accepted'),
    req('r-5', 't-5', 'u-regina', 'accepted'),
    req('r-6', 't-5', 'u-emilio', 'accepted'),
    req('r-7', 't-6', 'u-ana', 'accepted'),
    req('r-8', 't-7', 'u-ana', 'accepted'),
    req('r-9', 't-9', 'u-emilio', 'accepted'),
    req('r-10', 't-2', 'u-sofia', 'pending'),
  ]

  const schedules: Schedule[] = users.flatMap((u, i) =>
    scheduleTemplates[i].map(([weekday, start, end, building], j) => ({
      id: `s-${u.id}-${j}`,
      userId: u.id,
      weekday,
      start,
      end,
      building,
    })),
  )

  const targets: Record<ZoneId, { occupied: number; exits: number; manual: number; lastMinAgo: number }> = {
    A: { occupied: 112, exits: 38, manual: 108, lastMinAgo: 2 },
    B: { occupied: 74, exits: 21, manual: 70, lastMinAgo: 1 },
    C: { occupied: 28, exits: 9, manual: 31, lastMinAgo: 4 },
    D: { occupied: 52, exits: 17, manual: 41, lastMinAgo: 2 },
  }

  const sensorCounters = {} as DbState['sensorCounters']
  const sensorStatus = {} as DbState['sensorStatus']
  const manualEstimates = {} as DbState['manualEstimates']
  const sensorEvents: SensorEvent[] = []

  for (const zone of PARKING_ZONES) {
    const t = targets[zone.id]
    sensorCounters[zone.id] = { entries: t.occupied + t.exits, exits: t.exits }
    manualEstimates[zone.id] = t.manual
    const last = new Date(now.getTime() - t.lastMinAgo * 60000)
    sensorStatus[zone.id] = { zoneId: zone.id, online: true, lastEventAt: last.toISOString() }
    for (let k = 0; k < 12; k++) {
      const isExit = k % 4 === 3
      sensorEvents.push({
        id: `se-${zone.id}-${k}`,
        zoneId: zone.id,
        sensorType: isExit ? 'salida' : 'entrada',
        counterId: isExit ? zone.exitCounterId : zone.entranceCounterId,
        timestamp: new Date(last.getTime() - k * 3 * 60000).toISOString(),
      })
    }
  }

  const parkingEvents: ParkingEvent[] = [
    { id: 'pe-1', userId: 'u-carlos', zoneId: 'B', type: 'entrada', timestamp: new Date(now.getTime() - 50 * 60000).toISOString() },
  ]

  return { users, trips, requests, schedules, parkingEvents, sensorCounters, sensorEvents, sensorStatus, manualEstimates }
}
