import { trafficLightFor } from './config'
import type { ZoneId, ZoneOccupancy } from './types'

/**
 * NEXT_PUBLIC_PARKING_DEMO=true fills the parking screens with invented occupancy for presentations.
 * The UI labels it "Simulado"; real registered entries are still added on top.
 */
export const PARKING_DEMO = process.env.NEXT_PUBLIC_PARKING_DEMO === 'true'

/** A busy weekday on campus: some zones free, some limited, some full. Invented numbers. */
const DEMO_PERCENTAGE: Record<ZoneId, number> = {
  P1: 46, P2: 83, P3: 38, P4: 91, P5: 94, P6: 63, P7: 87, P8: 71, P9: 97, P10: 55,
}

/** Moves up to two cars in or out every five minutes, so the demo doesn't look frozen. */
function drift(zoneId: ZoneId, now: number): number {
  let hash = Math.floor(now / 300_000)
  for (const char of zoneId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return (hash % 5) - 2
}

/** Demo cars plus the real registered entries, so registering an entry still moves the count. */
export function withDemoOccupancy(o: ZoneOccupancy, now = Date.now()): ZoneOccupancy {
  const capacity = o.zone.capacity
  const demoCars = Math.round((capacity * DEMO_PERCENTAGE[o.zone.id]) / 100) + drift(o.zone.id, now)
  const occupied = Math.min(capacity, Math.max(0, demoCars + o.occupied))
  const percentage = Math.round((occupied / capacity) * 100)
  return { ...o, occupied, percentage, light: trafficLightFor(percentage), source: 'simulado', manualEstimate: o.occupied }
}
