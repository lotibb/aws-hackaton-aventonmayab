import { timeToMinutes } from './format'
import type { WeeklyTripDay } from './types'

export const SCHEDULE_GRID_DAYS = [1, 2, 3, 4, 5, 6]

function clockTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Campus day: 07:00 to 22:00, in complete 90-minute blocks. */
export const SCHEDULE_GRID_BLOCKS = Array.from({ length: 10 }, (_, index) => {
  const start = 7 * 60 + index * 90
  return { start: clockTime(start), end: clockTime(start + 90) }
})

export interface SchedulePeriod {
  weekday: number
  start: string
  end: string
}

/** An end time touching the next start is not an overlap. Also handles custom durations. */
export function schedulesOverlap(first: SchedulePeriod, second: SchedulePeriod): boolean {
  return first.weekday === second.weekday
    && timeToMinutes(first.start) < timeToMinutes(second.end)
    && timeToMinutes(second.start) < timeToMinutes(first.end)
}

export function scheduleBlockKey(period: SchedulePeriod): string {
  return `${period.weekday}-${period.start}`
}

/**
 * Each class day with the first class start and the last class end, Monday first.
 * Mirrors what the trips Lambda publishes for a weekly trip.
 */
export function weeklyTripDays(periods: SchedulePeriod[]): WeeklyTripDay[] {
  const byDay = new Map<number, WeeklyTripDay>()
  for (const { weekday, start, end } of periods) {
    const day = byDay.get(weekday)
    if (!day) byDay.set(weekday, { weekday, arriveBy: start, leaveAt: end })
    else {
      if (timeToMinutes(start) < timeToMinutes(day.arriveBy)) day.arriveBy = start
      if (timeToMinutes(end) > timeToMinutes(day.leaveAt)) day.leaveAt = end
    }
  }
  return [...byDay.values()].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
}
