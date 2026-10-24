import { PARKING_ZONES, REVIEW_DISCREPANCY, getZone, trafficLightFor } from '../config'
import { WEEKDAYS, minutesToTime, timeToMinutes } from '../format'
import { notifyChange } from '../mock/db'
import { buildForecast, projectPercentage, type AggregatedPresence } from '../projections'
import type { ParkingEvent, SensorEvent, TrafficLight, User, ZoneForecast, ZoneId, ZoneOccupancy } from '../types'
import { api } from './api'
import { userService } from './user-service'

// Shapes returned by the parking API (docs/api.md). Only aggregate counts, never who is parked.
export interface ApiZone {
  zoneId: string
  name: string
  area?: string
  capacity: number
  sensorCount: number
  manualCount: number
  sensorOnline: boolean
  lastReadingAt: string | null
  recentEvents: Array<Omit<SensorEvent, 'zoneId'>>
}

interface ApiSession {
  userId: string
  zoneId: ZoneId
  enteredAt: string
}

const isCampusZone = (id: string): id is ZoneId => PARKING_ZONES.some((z) => z.id === id)

// Demo-only adjustments: manual registrations don't move the simulated sensors.
// Keep their visual delta in this browser, separate from the API's manualCount.
const MANUAL_ADJUSTMENTS_KEY = 'aventon-mayab:parking-manual-adjustments:v1'
let manualAdjustments: Partial<Record<ZoneId, number>> = {}
let storageUnavailable = false

function readManualAdjustments() {
  try {
    if (!storageUnavailable && typeof window !== 'undefined') {
      const stored = JSON.parse(window.localStorage.getItem(MANUAL_ADJUSTMENTS_KEY) ?? 'null')
      manualAdjustments = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
    }
  } catch { storageUnavailable = true }
  return manualAdjustments
}

function adjustmentFor(zoneId: ZoneId) {
  const value = readManualAdjustments()[zoneId]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function adjustManualDemo(zoneId: ZoneId, delta: number) {
  manualAdjustments = { ...readManualAdjustments(), [zoneId]: adjustmentFor(zoneId) + delta }
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(MANUAL_ADJUSTMENTS_KEY, JSON.stringify(manualAdjustments))
  } catch { storageUnavailable = true }
}

export function resetManualDemoAdjustments() {
  manualAdjustments = {}
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(MANUAL_ADJUSTMENTS_KEY)
    storageUnavailable = false
  } catch { storageUnavailable = true }
}

export async function fetchZones(): Promise<Array<ApiZone & { zoneId: ZoneId }>> {
  const zones = await api<ApiZone[]>('/parking/zones')
  // The table may hold other zones (e.g. integration tests); the app shows the campus ones.
  return zones.filter((z): z is ApiZone & { zoneId: ZoneId } => isCampusZone(z.zoneId))
}

function toOccupancy(api: ApiZone & { zoneId: ZoneId }): ZoneOccupancy {
  const zone = { ...getZone(api.zoneId), capacity: api.capacity }
  const clamp = (n: number) => Math.min(zone.capacity, Math.max(0, n))
  const sensorOccupied = clamp(api.sensorCount)
  const manualEstimate = clamp(api.manualCount)
  const online = api.sensorOnline
  // Offline already uses the API's manual count: don't apply the delta twice.
  const occupied = online ? clamp(sensorOccupied + adjustmentFor(api.zoneId)) : manualEstimate
  const percentage = Math.round((occupied / zone.capacity) * 100)
  return {
    zone,
    occupied,
    percentage,
    light: trafficLightFor(percentage),
    // The counters are the simulator's for now, so their data is labeled "Simulado".
    source: online ? 'simulado' : 'estimado',
    sensorStatus: { zoneId: api.zoneId, online, lastEventAt: api.lastReadingAt ?? new Date().toISOString() },
    sensorOccupied,
    manualEstimate,
    // If sensors and manual check-ins disagree by more than 10% of capacity, flag it.
    inReview: online && Math.abs(sensorOccupied - manualEstimate) / zone.capacity > REVIEW_DISCREPANCY,
  }
}

// Students per time slot from everyone's class schedules, aggregated by the API.
const PRESENCE_TTL_MS = 60_000
let presenceCache: { at: number; data: Promise<AggregatedPresence> } | undefined

function getPresence(): Promise<AggregatedPresence> {
  if (!presenceCache || Date.now() - presenceCache.at > PRESENCE_TTL_MS) {
    const data = api<AggregatedPresence>('/parking/presence')
    presenceCache = { at: Date.now(), data }
    data.catch(() => (presenceCache = undefined))
  }
  return presenceCache.data
}

/** Called when the student's own schedule changes, so the forecasts include it. */
export function invalidatePresence() {
  presenceCache = undefined
}

export interface ParkingRecommendation {
  message: string
  arriveBefore?: string
  alternativeZoneId?: ZoneId
}

export interface PersonalInsight {
  firstClass: string
  building: string
  arrival: string
  zones: Array<{ zoneId: ZoneId; percentage: number; light: TrafficLight }>
  bestZoneId: ZoneId
}

export const parkingService = {
  /** Aggregate counts only — never who is parked or which vehicle. */
  async getZonesOccupancy(_user: User): Promise<ZoneOccupancy[]> {
    return (await fetchZones()).map(toOccupancy)
  },

  /** A student's own active entry. The API only ever returns the caller's own. */
  async getMyActiveEntry(user: User): Promise<ParkingEvent | null> {
    const { session } = await api<{ session: ApiSession | null }>('/parking/session')
    if (!session) return null
    return { id: `pe-${session.enteredAt}`, userId: user.id, zoneId: session.zoneId, type: 'entrada', timestamp: session.enteredAt }
  },

  /** Each check-in nudges the zone's manual estimate; the API keeps both in one transaction. */
  async checkIn(_user: User, zoneId: ZoneId): Promise<void> {
    await api('/parking/entry', { method: 'POST', body: { zoneId } })
    adjustManualDemo(zoneId, 1)
    notifyChange()
  },

  async checkOut(_user: User): Promise<void> {
    const { session } = await api<{ session: ApiSession }>('/parking/exit', { method: 'POST' })
    // Always subtract from the zone actually entered, not the current map selection.
    adjustManualDemo(session.zoneId, -1)
    notifyChange()
  },

  async getForecast(_user: User, zoneId: ZoneId, weekday: number): Promise<ZoneForecast> {
    const agg = await getPresence()
    return { zoneId, weekday, points: buildForecast(agg, zoneId, weekday), source: 'estimado' }
  },

  async projectAt(_user: User, zoneId: ZoneId, weekday: number, time: string) {
    const agg = await getPresence()
    const zone = getZone(zoneId)
    const percentage = projectPercentage(agg, zoneId, weekday, timeToMinutes(time))
    return {
      percentage,
      light: trafficLightFor(percentage),
      freeSpots: Math.max(0, Math.round(zone.capacity * (1 - percentage / 100))),
    }
  },

  async getRecommendation(_user: User, zoneId: ZoneId, weekday: number): Promise<ParkingRecommendation> {
    const agg = await getPresence()
    const zone = getZone(zoneId)
    let fullAt: number | undefined
    for (let m = 360; m <= 1260; m += 10) {
      if (projectPercentage(agg, zoneId, weekday, m) > 85) {
        fullAt = m
        break
      }
    }
    if (fullAt === undefined) {
      return { message: `El ${WEEKDAYS[weekday].toLowerCase()} la ${zone.name} no se llenará. Llega a la hora que te convenga.` }
    }
    const alternatives = PARKING_ZONES.filter((z) => z.id !== zoneId)
      .map((z) => ({ id: z.id, pct: projectPercentage(agg, z.id, weekday, fullAt + 30) }))
      .sort((a, b) => a.pct - b.pct)
    const alt = alternatives[0]
    const arriveBefore = minutesToTime(fullAt)
    const altText = alt && alt.pct < 85 ? ` o estacionarte en ${getZone(alt.id).name}` : ''
    return {
      message: `Te conviene llegar antes de las ${arriveBefore}${altText}.`,
      arriveBefore,
      alternativeZoneId: alt && alt.pct < 85 ? alt.id : undefined,
    }
  },

  /** Uses the caller's own schedule only to personalize their view; never shared. */
  async getPersonalInsight(user: User, weekday: number): Promise<PersonalInsight | null> {
    const [schedules, agg] = await Promise.all([userService.listSchedules(user), getPresence()])
    const first = schedules
      .filter((s) => s.weekday === weekday)
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))[0]
    if (!first) return null
    const arrivalMinutes = timeToMinutes(first.start) - 20
    const zones = PARKING_ZONES.map((z) => {
      const percentage = projectPercentage(agg, z.id, weekday, arrivalMinutes)
      return { zoneId: z.id, percentage, light: trafficLightFor(percentage) }
    })
    const best = [...zones].sort((a, b) => a.percentage - b.percentage)[0]
    return {
      firstClass: minutesToTime(timeToMinutes(first.start)),
      building: first.building,
      arrival: minutesToTime(arrivalMinutes),
      zones,
      bestZoneId: best.zoneId,
    }
  },
}
