import { notifyChange } from '../mock/db'
import type { SensorEvent, SensorType, User, ZoneId } from '../types'
import { api } from './api'
import { fetchZones } from './parking-service'

/**
 * Infrared entrance/exit counters per zone. A counter reports each car with POST /parking/sensor-events;
 * today the simulator in Perfil sends those events. Sensors only count cars: no plates, no images, no personal data.
 */
export const sensorService = {
  async listRecentEvents(_user: User, zoneId: ZoneId, limit = 6): Promise<SensorEvent[]> {
    const zone = (await fetchZones()).find((z) => z.zoneId === zoneId)
    return (zone?.recentEvents ?? []).slice(0, limit).map((e) => ({ ...e, zoneId }))
  },

  /** Demo: sends the same event a physical counter would. */
  async simulateEvent(_user: User, zoneId: ZoneId, sensorType: SensorType): Promise<void> {
    await api('/parking/sensor-events', { method: 'POST', body: { zoneId, sensorType } })
    notifyChange()
  },

  /** Demo: turns a zone's counters on or off, to see the fallback to manual estimates. */
  async setOnline(_user: User, zoneId: ZoneId, online: boolean): Promise<void> {
    await api(`/parking/zones/${encodeURIComponent(zoneId)}/sensor`, { method: 'POST', body: { online } })
    notifyChange()
  },

  /** Demo: puts every zone back to its starting counts. Students' active entries stay. */
  async resetDemo(_user: User): Promise<void> {
    await api('/parking/demo/reset', { method: 'POST' })
    notifyChange()
  },
}
