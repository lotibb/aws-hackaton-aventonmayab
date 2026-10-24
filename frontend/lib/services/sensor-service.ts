import { getZone, REVIEW_DISCREPANCY, trafficLightFor } from '../config'
import { notifyChange } from '../mock/db'
import type { SensorEvent, SensorStatus, SensorType, User, ZoneId, ZoneOccupancy } from '../types'
import { api } from './api'
import { fetchZones } from './parking-service'

/** Simulator readings remain shared through the API but never alter registeredOccupied. */
export const sensorService = {
  async getDemoZonesOccupancy(_user: User): Promise<ZoneOccupancy[]> {
    return (await fetchZones()).map((row) => {
      const zone = { ...getZone(row.zoneId), capacity: row.capacity ?? getZone(row.zoneId).capacity }
      const sensorOccupied = Math.min(zone.capacity, Math.max(0, row.sensorCount ?? 0))
      const manualEstimate = Math.min(zone.capacity, Math.max(0, row.manualCount ?? 0))
      const occupied = row.sensorOnline ? sensorOccupied : manualEstimate
      const percentage = Math.round(occupied / zone.capacity * 100)
      return {
        zone, occupied, percentage, sensorOccupied, manualEstimate,
        sensorStatus: { zoneId: row.zoneId, online: row.sensorOnline, lastEventAt: row.lastReadingAt ?? '' },
        source: 'simulado', light: trafficLightFor(percentage),
        inReview: row.sensorOnline && Math.abs(sensorOccupied - manualEstimate) / zone.capacity > REVIEW_DISCREPANCY,
      }
    })
  },

  async getStatuses(_user: User): Promise<SensorStatus[]> {
    return (await fetchZones()).map((row) => ({ zoneId: row.zoneId, online: row.sensorOnline, lastEventAt: row.lastReadingAt ?? '' }))
  },

  async listRecentEvents(_user: User, zoneId: ZoneId, limit = 6): Promise<SensorEvent[]> {
    const zone = (await fetchZones()).find((z) => z.zoneId === zoneId)
    return (zone?.recentEvents ?? []).slice(0, limit).map((e) => ({ ...e, zoneId }))
  },

  async simulateEvent(_user: User, zoneId: ZoneId, sensorType: SensorType): Promise<void> {
    await api('/parking/sensor-events', { method: 'POST', body: { zoneId, sensorType } })
    notifyChange()
  },

  async setOnline(_user: User, zoneId: ZoneId, online: boolean): Promise<void> {
    await api(`/parking/zones/${encodeURIComponent(zoneId)}/sensor`, { method: 'POST', body: { online } })
    notifyChange()
  },

  async resetDemo(_user: User): Promise<void> {
    await api('/parking/demo/reset', { method: 'POST' })
    notifyChange()
  },
}
