import { PARKING_ZONES, REVIEW_DISCREPANCY, getZone, trafficLightFor } from '../config'
import { WEEKDAYS, minutesToTime, timeToMinutes } from '../format'
import { createId, readDb, writeDb } from '../mock/db'
import type { DbState } from '../mock/seed'
import { aggregateSchedules, buildForecast, projectPercentage } from '../projections'
import type { ParkingEvent, TrafficLight, User, ZoneForecast, ZoneId, ZoneOccupancy } from '../types'
import { ServiceError } from './errors'

function computeOccupancy(db: DbState, zoneId: ZoneId): ZoneOccupancy {
  const zone = getZone(zoneId)
  const counters = db.sensorCounters[zoneId]
  const sensorStatus = db.sensorStatus[zoneId]
  // Occupancy = entries − exits, clamped to [0, capacity].
  const sensorOccupied = Math.min(zone.capacity, Math.max(0, counters.entries - counters.exits))
  const manualEstimate = Math.min(zone.capacity, Math.max(0, db.manualEstimates[zoneId]))
  const occupied = sensorStatus.online ? sensorOccupied : manualEstimate
  const percentage = Math.round((occupied / zone.capacity) * 100)
  const inReview = sensorStatus.online && Math.abs(sensorOccupied - manualEstimate) / zone.capacity > REVIEW_DISCREPANCY

  return {
    zone,
    occupied,
    percentage,
    light: trafficLightFor(percentage),
    source: sensorStatus.online ? 'simulado' : 'estimado',
    sensorStatus,
    sensorOccupied,
    manualEstimate,
    inReview,
  }
}

function latestEventFor(db: DbState, userId: string): ParkingEvent | undefined {
  return db.parkingEvents
    .filter((e) => e.userId === userId)
    // Events appended in the same millisecond must prefer the latest action.
    .reverse()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
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
    const db = readDb()
    return PARKING_ZONES.map((z) => computeOccupancy(db, z.id))
  },

  /** A student's own active entry. The authorizer scopes this query to the caller's userId. */
  async getMyActiveEntry(user: User): Promise<ParkingEvent | null> {
    const latest = latestEventFor(readDb(), user.id)
    return latest?.type === 'entrada' ? latest : null
  },

  async checkIn(user: User, zoneId: ZoneId): Promise<void> {
    writeDb((db) => {
      const latest = latestEventFor(db, user.id)
      if (latest?.type === 'entrada') throw new ServiceError('CONFLICT', 'Ya tienes una entrada activa. Registra tu salida primero.')
      db.parkingEvents.push({ id: createId('pe'), userId: user.id, zoneId, type: 'entrada', timestamp: new Date().toISOString() })
      // The estimate is extrapolated from the sample of check-ins; each one nudges it.
      db.manualEstimates[zoneId] = Math.min(getZone(zoneId).capacity, db.manualEstimates[zoneId] + 1)
    })
  },

  async checkOut(user: User): Promise<void> {
    writeDb((db) => {
      const latest = latestEventFor(db, user.id)
      if (latest?.type !== 'entrada') throw new ServiceError('CONFLICT', 'No tienes una entrada activa.')
      db.parkingEvents.push({ id: createId('pe'), userId: user.id, zoneId: latest.zoneId, type: 'salida', timestamp: new Date().toISOString() })
      db.manualEstimates[latest.zoneId] = Math.max(0, db.manualEstimates[latest.zoneId] - 1)
    })
  },

  async getForecast(_user: User, zoneId: ZoneId, weekday: number): Promise<ZoneForecast> {
    const agg = aggregateSchedules(readDb().schedules)
    return { zoneId, weekday, points: buildForecast(agg, zoneId, weekday), source: 'estimado' }
  },

  async projectAt(_user: User, zoneId: ZoneId, weekday: number, time: string) {
    const agg = aggregateSchedules(readDb().schedules)
    const zone = getZone(zoneId)
    const percentage = projectPercentage(agg, zoneId, weekday, timeToMinutes(time))
    return {
      percentage,
      light: trafficLightFor(percentage),
      freeSpots: Math.max(0, Math.round(zone.capacity * (1 - percentage / 100))),
    }
  },

  async getRecommendation(_user: User, zoneId: ZoneId, weekday: number): Promise<ParkingRecommendation> {
    const agg = aggregateSchedules(readDb().schedules)
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
    const db = readDb()
    const mine = db.schedules
      .filter((s) => s.userId === user.id && s.weekday === weekday)
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    const first = mine[0]
    if (!first) return null
    const agg = aggregateSchedules(db.schedules)
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
