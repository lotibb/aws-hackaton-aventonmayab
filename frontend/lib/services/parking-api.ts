import { PARKING_ZONES, trafficLightFor } from '../config'
import type { ParkingEvent, User, ZoneId, ZoneOccupancy } from '../types'
import { ServiceError } from './errors'

export interface ApiParkingZone {
  zoneId: string
  name: string
  area?: string
  capacity: number | null
  capacityEstimated?: boolean
  occupied: number | null
  available: number | null
  occupancyPercentage: number | null
  source: 'registrado'
  updatedAt?: string
  sensorOnline: boolean
  lastReadingAt?: string
  currentCount?: number
  sensorCount?: number
  manualCount?: number
  recentEvents?: Array<{ id: string; sensorType: 'entrada' | 'salida'; timestamp: string; counterId: string }>
}

export interface ApiParkingSession {
  zoneId: string
  zoneName?: string
  enteredAt: string
  sessionId?: string
}

export function toOccupancies(rows: ApiParkingZone[]): ZoneOccupancy[] {
  return PARKING_ZONES.map((configured) => {
    const row = rows.find((item) => item.zoneId === configured.id)
    if (!row || row.source !== 'registrado' || !Number.isInteger(row.occupied) || row.occupied! < 0 ||
      !Number.isInteger(row.capacity) || row.capacity! <= 0) {
      throw new ServiceError('CONFLICT', `La zona ${configured.id} no está configurada en la API de Parking. Es necesario desplegar el backend y sincronizar las zonas.`)
    }
    const occupied = row.occupied!
    const capacity = row.capacity!
    const percentage = Math.round(occupied / capacity * 100)
    return {
      zone: { ...configured, name: row.name, area: row.area ?? configured.area, capacity, capacityEstimated: row.capacityEstimated ?? true },
      occupied,
      percentage,
      light: trafficLightFor(percentage),
      source: 'registrado',
      updatedAt: row.updatedAt,
      sensorStatus: { zoneId: configured.id, online: row.sensorOnline, lastEventAt: row.lastReadingAt ?? '' },
      sensorOccupied: row.currentCount ?? 0,
      manualEstimate: occupied,
      inReview: false,
    }
  })
}

export function toParkingEntry(session: ApiParkingSession | null, user: User): ParkingEvent | null {
  return session ? {
    id: session.sessionId ?? session.enteredAt,
    userId: user.id,
    // Legacy sessions may reference a zone outside the current map. Preserve the
    // original ID/name so the user can close it without assigning a different lot.
    zoneId: session.zoneId as ZoneId,
    zoneName: session.zoneName ?? session.zoneId,
    timestamp: session.enteredAt,
    type: 'entrada',
  } : null
}
