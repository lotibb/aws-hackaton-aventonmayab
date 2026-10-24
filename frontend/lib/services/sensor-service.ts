import { getZone, PARKING_ZONES, REVIEW_DISCREPANCY, trafficLightFor } from '../config'
import { createId, readDb, writeDb } from '../mock/db'
import type { SensorEvent, SensorStatus, SensorType, User, ZoneId, ZoneOccupancy } from '../types'
import { ServiceError } from './errors'

const MAX_STORED_EVENTS = 400

/**
 * Infrared entrance/exit counters per zone.
 * In production each counter publishes to an AWS IoT Core topic (e.g. `mayab/parking/{zoneId}/{sensorType}`);
 * an IoT Rule writes the event to DynamoDB and atomically increments the zone counters
 * (UpdateExpression: ADD entries :one). The app receives updates through an IoT/WebSocket subscription.
 * Sensors only count cars: no plates, no images, no personal data.
 */
export const sensorService = {
  /** Isolated simulator data; never writes or replaces the real parking API. */
  async getDemoZonesOccupancy(_user: User): Promise<ZoneOccupancy[]> {
    const db = readDb()
    return PARKING_ZONES.map((zone) => {
      const counters = db.sensorCounters[zone.id]
      const sensorStatus = db.sensorStatus[zone.id]
      const sensorOccupied = Math.min(zone.capacity, Math.max(0, counters.entries - counters.exits))
      const manualEstimate = Math.min(zone.capacity, Math.max(0, db.manualEstimates[zone.id]))
      const occupied = sensorStatus.online ? sensorOccupied : manualEstimate
      const percentage = Math.round(occupied / zone.capacity * 100)
      return {
        zone, sensorStatus, sensorOccupied, manualEstimate, occupied, percentage,
        light: trafficLightFor(percentage), source: 'simulado',
        inReview: sensorStatus.online && Math.abs(sensorOccupied - manualEstimate) / zone.capacity > REVIEW_DISCREPANCY,
      }
    })
  },
  async getStatuses(_user: User): Promise<SensorStatus[]> {
    return Object.values(readDb().sensorStatus)
  },

  async listRecentEvents(_user: User, zoneId: ZoneId, limit = 6): Promise<SensorEvent[]> {
    return readDb()
      .sensorEvents.filter((e) => e.zoneId === zoneId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  },

  /** Demo only. Simulates the payload an IoT Core rule would ingest. */
  async simulateEvent(_user: User, zoneId: ZoneId, sensorType: SensorType): Promise<void> {
    const zone = getZone(zoneId)
    writeDb((db) => {
      const status = db.sensorStatus[zoneId]
      if (!status.online) throw new ServiceError('CONFLICT', 'Los sensores de esta zona están fuera de línea.')
      const counters = db.sensorCounters[zoneId]
      const occupied = counters.entries - counters.exits
      // Physical counters still fire, but a real exit can't happen from an empty lot.
      if (sensorType === 'salida' && occupied <= 0) return
      if (sensorType === 'entrada' && occupied >= zone.capacity) return
      if (sensorType === 'entrada') counters.entries += 1
      else counters.exits += 1
      const timestamp = new Date().toISOString()
      db.sensorEvents.push({
        id: createId('se'),
        zoneId,
        sensorType,
        timestamp,
        counterId: sensorType === 'entrada' ? zone.entranceCounterId : zone.exitCounterId,
      })
      if (db.sensorEvents.length > MAX_STORED_EVENTS) db.sensorEvents = db.sensorEvents.slice(-MAX_STORED_EVENTS)
      status.lastEventAt = timestamp
    })
  },

  /** Demo only. In production status comes from IoT Core lifecycle events (connected/disconnected). */
  async setOnline(_user: User, zoneId: ZoneId, online: boolean): Promise<void> {
    writeDb((db) => {
      db.sensorStatus[zoneId].online = online
    })
  },
}
