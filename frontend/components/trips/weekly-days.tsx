import { WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/format'
import type { WeeklyTripDay } from '@/lib/types'

/** Day by day: when the driver has to be at the university and when they leave it. */
export function WeeklyDaysTable({ days }: { days: WeeklyTripDay[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="py-1 text-left font-medium">Día</th>
          <th className="py-1 text-right font-medium">Llega a la uni</th>
          <th className="py-1 text-right font-medium">Sale de la uni</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {days.map((d) => (
          <tr key={d.weekday}>
            <td className="py-2 font-medium">{WEEKDAYS[d.weekday]}</td>
            <td className="py-2 text-right tabular-nums">{d.arriveBy}</td>
            <td className="py-2 text-right tabular-nums">{d.leaveAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** "Lun, Mar, Jue" */
export function weeklyDaysLabel(days: WeeklyTripDay[] = []): string {
  return days.map((d) => WEEKDAYS_SHORT[d.weekday]).join(', ')
}
