import { ZONE_DEMAND_FACTOR, trafficLightFor } from './config'
import { minutesToTime, timeToMinutes } from './format'
import type { ForecastPoint, Schedule, ZoneId } from './types'

/**
 * Invented historical occupancy patterns (percentage of capacity), labeled "Simulado" in the UI.
 * Weekdays: busiest 7:00–9:30, smaller peak ~11:00, quieter after 13:00, evening bump for evening programs.
 */
const WEEKDAY_PATTERN: Array<[number, number]> = [
  [360, 5], [390, 12], [420, 34], [450, 68], [480, 88], [510, 92], [540, 92], [570, 86],
  [600, 74], [630, 70], [660, 79], [690, 74], [720, 64], [780, 50], [840, 38], [900, 32],
  [960, 30], [1020, 30], [1080, 38], [1110, 42], [1170, 38], [1230, 24], [1260, 12],
]
const SATURDAY_PATTERN: Array<[number, number]> = [
  [360, 2], [450, 8], [510, 18], [600, 24], [720, 18], [840, 8], [960, 4], [1260, 1],
]
const SUNDAY_PATTERN: Array<[number, number]> = [
  [360, 1], [600, 4], [780, 3], [1260, 1],
]

function interpolate(pattern: Array<[number, number]>, minutes: number): number {
  if (minutes <= pattern[0][0]) return pattern[0][1]
  for (let i = 1; i < pattern.length; i++) {
    const [m1, v1] = pattern[i]
    const [m0, v0] = pattern[i - 1]
    if (minutes <= m1) return v0 + ((v1 - v0) * (minutes - m0)) / (m1 - m0)
  }
  return pattern[pattern.length - 1][1]
}

export function historicalPercentage(weekday: number, minutes: number): number {
  if (weekday === 0) return interpolate(SUNDAY_PATTERN, minutes)
  if (weekday === 6) return interpolate(SATURDAY_PATTERN, minutes)
  const friday = weekday === 5 ? 0.88 : 1
  return interpolate(WEEKDAY_PATTERN, minutes) * friday
}

/** Arrivals ~20 min before class starts; departures ~10 min after it ends. */
const ARRIVAL_LEAD = 20
const DEPARTURE_LAG = 10

/**
 * Aggregated counts only. Individual schedules never leave this function:
 * in production a scheduled Lambda will precompute these counts per weekday/slot.
 */
export interface AggregatedPresence {
  byWeekday: Record<number, number[]>
  max: number
}

const SLOT = 10
const DAY_START = 360
const DAY_END = 1260

export function aggregateSchedules(schedules: Schedule[]): AggregatedPresence {
  const byWeekday: Record<number, number[]> = {}
  let max = 1
  for (let d = 0; d < 7; d++) {
    const slots: number[] = []
    const daySchedules = schedules.filter((s) => s.weekday === d)
    for (let m = DAY_START; m <= DAY_END; m += SLOT) {
      const count = daySchedules.filter(
        (s) => timeToMinutes(s.start) - ARRIVAL_LEAD <= m && m < timeToMinutes(s.end) + DEPARTURE_LAG,
      ).length
      slots.push(count)
      if (count > max) max = count
    }
    byWeekday[d] = slots
  }
  return { byWeekday, max }
}

export function projectPercentage(agg: AggregatedPresence, zoneId: ZoneId, weekday: number, minutes: number): number {
  const clampedMinutes = Math.min(DAY_END, Math.max(DAY_START, minutes))
  const idx = Math.round((clampedMinutes - DAY_START) / SLOT)
  const scheduleShare = (agg.byWeekday[weekday]?.[idx] ?? 0) / agg.max
  const blended = 0.7 * historicalPercentage(weekday, clampedMinutes) + 0.3 * scheduleShare * 100
  return Math.round(Math.min(100, Math.max(0, blended * ZONE_DEMAND_FACTOR[zoneId])))
}

export function buildForecast(agg: AggregatedPresence, zoneId: ZoneId, weekday: number): ForecastPoint[] {
  const points: ForecastPoint[] = []
  for (let m = DAY_START; m <= DAY_END; m += 30) {
    const percentage = projectPercentage(agg, zoneId, weekday, m)
    points.push({ minutes: m, label: minutesToTime(m), percentage, light: trafficLightFor(percentage) })
  }
  return points
}
