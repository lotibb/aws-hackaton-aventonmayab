import { PARKING_ZONES, getZone, trafficLightFor } from '../config'
import { WEEKDAYS, minutesToTime, timeToMinutes } from '../format'
import { aggregateSchedules, buildForecast, projectPercentage } from '../projections'
import type { ParkingEvent, TrafficLight, User, ZoneForecast, ZoneId, ZoneOccupancy } from '../types'
import { api } from './api'
import { toOccupancies, toParkingEntry, type ApiParkingSession, type ApiParkingZone } from './parking-api'
import { userService } from './user-service'

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
    return toOccupancies(await api<ApiParkingZone[]>('/parking/zones', { cache: 'no-store' }))
  },

  /** A student's own active entry. The authorizer scopes this query to the caller's userId. */
  async getMyActiveEntry(user: User): Promise<ParkingEvent | null> {
    const { session } = await api<{ session: ApiParkingSession | null }>('/parking/session', { cache: 'no-store' })
    return toParkingEntry(session, user)
  },

  async checkIn(_user: User, zoneId: ZoneId): Promise<void> {
    await api('/parking/entry', { method: 'POST', body: { zoneId } })
  },

  async checkOut(_user: User): Promise<void> {
    await api('/parking/exit', { method: 'POST' })
  },

  async getForecast(user: User, zoneId: ZoneId, weekday: number): Promise<ZoneForecast> {
    const agg = aggregateSchedules(await userService.listSchedules(user))
    return { zoneId, weekday, points: buildForecast(agg, zoneId, weekday), source: 'estimado' }
  },

  async projectAt(user: User, zoneId: ZoneId, weekday: number, time: string) {
    const agg = aggregateSchedules(await userService.listSchedules(user))
    const zone = getZone(zoneId)
    const percentage = projectPercentage(agg, zoneId, weekday, timeToMinutes(time))
    return {
      percentage,
      light: trafficLightFor(percentage),
      freeSpots: Math.max(0, Math.round(zone.capacity * (1 - percentage / 100))),
    }
  },

  async getRecommendation(user: User, zoneId: ZoneId, weekday: number): Promise<ParkingRecommendation> {
    const agg = aggregateSchedules(await userService.listSchedules(user))
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
    const schedules = await userService.listSchedules(user)
    const mine = schedules
      .filter((s) => s.userId === user.id && s.weekday === weekday)
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    const first = mine[0]
    if (!first) return null
    const agg = aggregateSchedules(schedules)
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
