import { COLONIAS, type ParkingZone, type TrafficLight, type ZoneId } from './types'
import parkingCatalog from '../../backend/src/lib/parking-catalog.json'

export const UNIVERSITY_NAME = 'Anáhuac Mayab'
export const ALLOWED_EMAIL_DOMAIN = '@anahuac.mx'

/** Single source of truth for zone names and capacities. */
export const PARKING_ZONES: ParkingZone[] = parkingCatalog.map(({ demandFactor: _factor, ...zone }) => ({
  ...zone,
  id: zone.id as ZoneId,
  entranceCounterId: `cnt-${zone.id}-in`,
  exitCounterId: `cnt-${zone.id}-out`,
}))

export const ZONE_IDS: ZoneId[] = PARKING_ZONES.map((z) => z.id)

export function getZone(id: ZoneId): ParkingZone {
  const zone = PARKING_ZONES.find((z) => z.id === id)
  if (!zone) throw new Error(`Zona desconocida: ${id}`)
  return zone
}

/** Relative demand of each zone, used by projections. */
// Demo parameters only; the forecasting formula remains unchanged.
export const ZONE_DEMAND_FACTOR = Object.fromEntries(parkingCatalog.map((zone) => [zone.id, zone.demandFactor])) as Record<ZoneId, number>

export const TRAFFIC_THRESHOLDS = { yellow: 60, red: 85 } as const

export function trafficLightFor(percentage: number): TrafficLight {
  if (percentage > TRAFFIC_THRESHOLDS.red) return 'rojo'
  if (percentage >= TRAFFIC_THRESHOLDS.yellow) return 'amarillo'
  return 'verde'
}

/** If sensor and manual data disagree by more than this share of capacity, flag it. */
export const REVIEW_DISCREPANCY = 0.1

export const BUILDINGS = [
  'Central',
  'LIIET',
  'Edificio 5',
  'Salud I',
  'Salud II',
  'Rectoría',
  'Biblioteca',
  'Ingenierías',
  'Negocios',
  'Ciencias de la Salud',
  'Humanidades',
  'Arquitectura y Diseño',
  'Deportivo',
]

export const DEFAULT_DESTINATION = 'Universidad Anáhuac Mayab'
export const TRIP_LOCATION_SUGGESTIONS = [...new Set([...COLONIAS, 'Anáhuac Mayab', DEFAULT_DESTINATION])]

