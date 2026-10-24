import type { Colonia, MeetingPoint, ParkingZone, TrafficLight, ZoneId } from './types'

export const UNIVERSITY_NAME = 'Anáhuac Mayab'
export const ALLOWED_EMAIL_DOMAIN = '@anahuac.mx'

/** Single source of truth for zone names and capacities. */
export const PARKING_ZONES: ParkingZone[] = [
  { id: 'P1', name: 'Canchas y Salud I - Trasera', area: 'Canchas y Salud I', capacity: 80, capacityEstimated: true, mapPosition: { x: 19.9, y: 16.3 }, entranceCounterId: 'cnt-P1-in', exitCounterId: 'cnt-P1-out' },
  { id: 'P2', name: 'Central y LIIET - Trasera', area: 'Central y LIIET', capacity: 85, capacityEstimated: true, mapPosition: { x: 58.3, y: 16.3 }, entranceCounterId: 'cnt-P2-in', exitCounterId: 'cnt-P2-out' },
  { id: 'P3', name: 'tecniA', area: 'Parque Tecnológico y de Innovación', capacity: 65, capacityEstimated: true, mapPosition: { x: 8.9, y: 60 }, entranceCounterId: 'cnt-P3-in', exitCounterId: 'cnt-P3-out' },
  { id: 'P4', name: 'Salud - Posterior', area: 'Edificios de Salud', capacity: 40, capacityEstimated: true, mapPosition: { x: 33.6, y: 55.3 }, entranceCounterId: 'cnt-P4-in', exitCounterId: 'cnt-P4-out' },
  { id: 'P5', name: 'Central - Jardines', area: 'Estacionamiento central, junto a la glorieta', capacity: 95, capacityEstimated: true, mapPosition: { x: 42.2, y: 55.3 }, entranceCounterId: 'cnt-P5-in', exitCounterId: 'cnt-P5-out' },
  { id: 'P6', name: 'Le Cordon Bleu', area: 'Hacienda Mayab', capacity: 35, capacityEstimated: true, mapPosition: { x: 52.5, y: 67.6 }, entranceCounterId: 'cnt-P6-in', exitCounterId: 'cnt-P6-out' },
  { id: 'P7', name: 'Rectoría', area: 'Frente a Rectoría y LABICAM', capacity: 65, capacityEstimated: true, mapPosition: { x: 74.7, y: 57.6 }, entranceCounterId: 'cnt-P7-in', exitCounterId: 'cnt-P7-out' },
  { id: 'P8', name: 'Edificio 5 - Trasera', area: 'Arquitectura, Diseño, Comunicación e Ingeniería', capacity: 35, capacityEstimated: true, mapPosition: { x: 93.1, y: 42.5 }, entranceCounterId: 'cnt-P8-in', exitCounterId: 'cnt-P8-out' },
  { id: 'P9', name: 'Subway - Central', area: 'Junto a Subway y el edificio Central · ubicación aproximada', capacity: 35, capacityEstimated: true, mapPosition: { x: 57.7, y: 49.3 }, entranceCounterId: 'cnt-P9-in', exitCounterId: 'cnt-P9-out' },
  { id: 'P10', name: 'Edificio 5 - Lateral', area: 'Entre Edificio 5 y LABICAM · ubicación aproximada', capacity: 25, capacityEstimated: true, mapPosition: { x: 86.3, y: 56.5 }, entranceCounterId: 'cnt-P10-in', exitCounterId: 'cnt-P10-out' },
]

export const ZONE_IDS: ZoneId[] = PARKING_ZONES.map((z) => z.id)

export function getZone(id: ZoneId): ParkingZone {
  const zone = PARKING_ZONES.find((z) => z.id === id)
  if (!zone) throw new Error(`Zona desconocida: ${id}`)
  return zone
}

/** Relative demand of each zone, used by projections. */
// Demo parameters only; the forecasting formula remains unchanged.
export const ZONE_DEMAND_FACTOR: Record<ZoneId, number> = {
  P1: 0.68, P2: 0.98, P3: 0.68, P4: 1.02, P5: 1.08,
  P6: 0.98, P7: 1.08, P8: 0.98, P9: 1.08, P10: 0.98,
}

export const TRAFFIC_THRESHOLDS = { yellow: 60, red: 85 } as const

export function trafficLightFor(percentage: number): TrafficLight {
  if (percentage > TRAFFIC_THRESHOLDS.red) return 'rojo'
  if (percentage >= TRAFFIC_THRESHOLDS.yellow) return 'amarillo'
  return 'verde'
}

/** If sensor and manual data disagree by more than this share of capacity, flag it. */
export const REVIEW_DISCREPANCY = 0.1

export const BUILDINGS = [
  'Rectoría',
  'Biblioteca',
  'Ingenierías',
  'Negocios',
  'Ciencias de la Salud',
  'Humanidades',
  'Arquitectura y Diseño',
  'Deportivo',
]

/** Configurable list of public meeting points per colonia. No private addresses allowed. */
export const MEETING_POINTS: MeetingPoint[] = [
  { id: 'mp-montebello-1', colonia: 'Montebello', name: 'Plaza Montebello', description: 'Entrada principal, junto a la farmacia', kind: 'plaza' },
  { id: 'mp-montebello-2', colonia: 'Montebello', name: 'Parque de Montebello', description: 'Frente a las canchas', kind: 'parque' },
  { id: 'mp-altabrisa-1', colonia: 'Altabrisa', name: 'Plaza Altabrisa', description: 'Acceso por la avenida, área de taxis', kind: 'plaza' },
  { id: 'mp-altabrisa-2', colonia: 'Altabrisa', name: 'Glorieta de Altabrisa', description: 'Parada de autobús frente a la glorieta', kind: 'referencia' },
  { id: 'mp-cholul-1', colonia: 'Cholul', name: 'Iglesia de Cholul', description: 'Costado del parque principal', kind: 'referencia' },
  { id: 'mp-cholul-2', colonia: 'Cholul', name: 'Parque de Cholul', description: 'Junto al kiosco', kind: 'parque' },
  { id: 'mp-fm-1', colonia: 'Francisco de Montejo', name: 'Parque de Francisco de Montejo', description: 'Esquina con la tienda de conveniencia', kind: 'parque' },
  { id: 'mp-fm-2', colonia: 'Francisco de Montejo', name: 'Plaza Las Américas Montejo', description: 'Estacionamiento frontal', kind: 'plaza' },
  { id: 'mp-gsf-1', colonia: 'Gran Santa Fe', name: 'Parque Gran Santa Fe', description: 'Entrada del parque central', kind: 'parque' },
  { id: 'mp-gsf-2', colonia: 'Gran Santa Fe', name: 'Plaza comercial Gran Santa Fe', description: 'Frente al supermercado', kind: 'plaza' },
  { id: 'mp-gg-1', colonia: 'García Ginerés', name: 'Parque de las Américas', description: 'Lado de la biblioteca', kind: 'parque' },
  { id: 'mp-gg-2', colonia: 'García Ginerés', name: 'Monumento a la Patria', description: 'Parada sobre Paseo de Montejo', kind: 'referencia' },
  { id: 'mp-tn-1', colonia: 'Temozón Norte', name: 'Plaza La Isla', description: 'Acceso principal, área de ascenso', kind: 'plaza' },
  { id: 'mp-tn-2', colonia: 'Temozón Norte', name: 'Plaza Temozón', description: 'Frente a la cafetería', kind: 'plaza' },
  { id: 'mp-la-1', colonia: 'Las Américas', name: 'Parque Las Américas', description: 'Junto a los juegos infantiles', kind: 'parque' },
  { id: 'mp-la-2', colonia: 'Las Américas', name: 'Plaza Las Américas', description: 'Estacionamiento de la entrada norte', kind: 'plaza' },
  { id: 'mp-caucel-1', colonia: 'Caucel', name: 'Parque de Caucel', description: 'Frente a la iglesia', kind: 'parque' },
  { id: 'mp-caucel-2', colonia: 'Caucel', name: 'Plaza Ciudad Caucel', description: 'Junto al banco', kind: 'plaza' },
  { id: 'mp-centro-1', colonia: 'Centro', name: 'Plaza Grande', description: 'Costado de la Catedral', kind: 'referencia' },
  { id: 'mp-centro-2', colonia: 'Centro', name: 'Parque de Santa Lucía', description: 'Esquina de la calle 60', kind: 'parque' },
]

export function meetingPointsFor(colonia: Colonia): MeetingPoint[] {
  return MEETING_POINTS.filter((m) => m.colonia === colonia)
}

export function getMeetingPoint(id: string): MeetingPoint | undefined {
  return MEETING_POINTS.find((m) => m.id === id)
}

export const DEFAULT_DESTINATION = 'Universidad Anáhuac Mayab'

