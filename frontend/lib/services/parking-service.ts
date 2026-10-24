import { PARKING_ZONES, getZone, trafficLightFor } from '../config'
import { WEEKDAYS, minutesToTime, timeToMinutes } from '../format'
import { notifyChange } from '../mock/db'
import { buildForecast, projectPercentage, type AggregatedPresence } from '../projections'
import type { ParkingEvent, TrafficLight, User, ZoneForecast, ZoneId, ZoneOccupancy } from '../types'
import { api } from './api'
import { toOccupancies, toParkingEntry, type ApiParkingSession, type ApiParkingZone } from './parking-api'
import { userService } from './user-service'

const isCampusZone = (id: string): id is ZoneId => PARKING_ZONES.some((zone) => zone.id === id)

export async function fetchZones(): Promise<Array<ApiParkingZone & { zoneId: ZoneId }>> {
  const zones = await api<ApiParkingZone[]>('/parking/zones', { cache: 'no-store' })
  return zones.filter((zone): zone is ApiParkingZone & { zoneId: ZoneId } => isCampusZone(zone.zoneId))
}

// Retain main's server-side aggregation of all schedules for forecasts.
const PRESENCE_TTL_MS = 60_000
let presenceCache: { at: number; data: Promise<AggregatedPresence> } | undefined
function getPresence(): Promise<AggregatedPresence> {
  if (!presenceCache || Date.now() - presenceCache.at > PRESENCE_TTL_MS) {
    const data = api<AggregatedPresence>('/parking/presence', { cache: 'no-store' })
    presenceCache = { at: Date.now(), data }
    data.catch(() => { presenceCache = undefined })
  }
  return presenceCache.data
}

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
  async getZonesOccupancy(_user: User): Promise<ZoneOccupancy[]> {
    return toOccupancies(await fetchZones())
  },

  async getMyActiveEntry(user: User): Promise<ParkingEvent | null> {
    const { session } = await api<{ session: ApiParkingSession | null }>('/parking/session', { cache: 'no-store' })
    return toParkingEntry(session, user)
  },

  async checkIn(_user: User, zoneId: ZoneId): Promise<void> {
    await api('/parking/entry', { method: 'POST', body: { zoneId } })
    notifyChange()
  },

  async checkOut(_user: User): Promise<void> {
    await api('/parking/exit', { method: 'POST' })
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
    return { percentage, light: trafficLightFor(percentage), freeSpots: Math.max(0, Math.round(zone.capacity * (1 - percentage / 100))) }
  },

  async getRecommendation(_user: User, zoneId: ZoneId, weekday: number): Promise<ParkingRecommendation> {
    const agg = await getPresence()
    const zone = getZone(zoneId)
    let fullAt: number | undefined
    for (let m = 360; m <= 1260; m += 10) {
      if (projectPercentage(agg, zoneId, weekday, m) > 85) { fullAt = m; break }
    }
    if (fullAt === undefined) return { message: `El ${WEEKDAYS[weekday].toLowerCase()} la ${zone.name} no se llenará. Llega a la hora que te convenga.` }
    const alternatives = PARKING_ZONES.filter((z) => z.id !== zoneId)
      .map((z) => ({ id: z.id, pct: projectPercentage(agg, z.id, weekday, fullAt + 30) }))
      .sort((a, b) => a.pct - b.pct)
    const alt = alternatives[0]
    const arriveBefore = minutesToTime(fullAt)
    const altText = alt && alt.pct < 85 ? ` o estacionarte en ${getZone(alt.id).name}` : ''
    return { message: `Te conviene llegar antes de las ${arriveBefore}${altText}.`, arriveBefore, alternativeZoneId: alt && alt.pct < 85 ? alt.id : undefined }
  },

  async getPersonalInsight(user: User, weekday: number): Promise<PersonalInsight | null> {
    const [schedules, agg] = await Promise.all([userService.listSchedules(user), getPresence()])
    const first = schedules.filter((s) => s.weekday === weekday).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))[0]
    if (!first) return null
    const arrivalMinutes = timeToMinutes(first.start) - 20
    const zones = PARKING_ZONES.map((z) => {
      const percentage = projectPercentage(agg, z.id, weekday, arrivalMinutes)
      return { zoneId: z.id, percentage, light: trafficLightFor(percentage) }
    })
    const best = [...zones].sort((a, b) => a.percentage - b.percentage)[0]
    return { firstClass: minutesToTime(timeToMinutes(first.start)), building: first.building, arrival: minutesToTime(arrivalMinutes), zones, bestZoneId: best.zoneId }
  },
}
