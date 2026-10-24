import { timeToMinutes } from './format'

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
