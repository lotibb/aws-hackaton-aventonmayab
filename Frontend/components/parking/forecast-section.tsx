'use client'

import { CalendarClock, Lightbulb } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { DataBadge } from '@/components/shared/data-badge'
import { TrafficLightDot } from '@/components/shared/traffic-light'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { useForecast, usePersonalInsight, useRecommendation } from '@/hooks/use-data'
import { getZone } from '@/lib/config'
import { WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/format'
import type { User, ZoneId } from '@/lib/types'
import { cn } from '@/lib/utils'

const chartConfig = {
  percentage: { label: 'Ocupación esperada', color: 'var(--primary)' },
} satisfies ChartConfig

export function ForecastSection({ user, zoneId }: { user: User; zoneId: ZoneId }) {
  const [weekday, setWeekday] = useState(() => new Date().getDay())
  const { data: forecast } = useForecast(user, zoneId, weekday)
  const { data: rec } = useRecommendation(user, zoneId, weekday)
  const { data: insight } = usePersonalInsight(user, weekday)
  const zone = getZone(zoneId)

  return (
    <section aria-labelledby="forecast" className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="forecast" className="font-semibold">
          Proyección · {zone.name}
        </h2>
        <DataBadge source={forecast?.source ?? 'estimado'} />
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="radiogroup" aria-label="Día de la semana">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={weekday === d}
            aria-label={WEEKDAYS[d]}
            onClick={() => setWeekday(d)}
            className={cn(
              'h-10 min-w-11 shrink-0 rounded-lg border px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
              weekday === d ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {WEEKDAYS_SHORT[d]}
          </button>
        ))}
      </div>

      {forecast ? (
        <ChartContainer config={chartConfig} className="aspect-auto h-52 w-full">
          <AreaChart data={forecast.points} margin={{ left: -20, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="fillForecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-percentage)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-percentage)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={2} tickMargin={8} />
            <YAxis domain={[0, 100]} ticks={[0, 60, 85, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
            <ReferenceLine y={60} stroke="var(--warning)" strokeDasharray="4 4" />
            <ReferenceLine y={85} stroke="var(--destructive)" strokeDasharray="4 4" />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}% ocupación esperada`} />} />
            <Area dataKey="percentage" type="monotone" stroke="var(--color-percentage)" strokeWidth={2} fill="url(#fillForecast)" />
          </AreaChart>
        </ChartContainer>
      ) : (
        <div className="h-52 animate-pulse rounded-xl bg-muted" />
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Basado en horarios de clase agregados (llegadas 20 min antes de cada clase) y patrones históricos de demostración. Nunca se
        usan horarios individuales.
      </p>

      {rec && (
        <p className="flex items-start gap-2 rounded-xl bg-primary/8 p-3 text-sm leading-relaxed">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {rec.message}
        </p>
      )}

      {insight && (
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Tu primera clase del {WEEKDAYS[weekday].toLowerCase()} es a las {insight.firstClass} en {insight.building}. Si llegas a las{' '}
              {insight.arrival}, te conviene {getZone(insight.bestZoneId).name}.
            </span>
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
            {insight.zones.map((z) => (
              <li key={z.zoneId} className="flex items-center gap-1.5 tabular-nums">
                <TrafficLightDot light={z.light} />
                {getZone(z.zoneId).name}: {z.percentage}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
