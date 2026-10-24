'use client'

import { CalendarDays, Lock, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSchedules } from '@/hooks/use-data'
import { timeToMinutes, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/format'
import { schedulesOverlap } from '@/lib/schedule-grid'
import { errorMessage, ServiceError, userService, type ScheduleInput } from '@/lib/services'
import type { User } from '@/lib/types'
import { ScheduleGridEditor } from './schedule-grid-editor'

export function ScheduleManager({ user }: { user: User }) {
  const { data: schedules, error: scheduleError, mutate: refreshSchedules } = useSchedules(user)
  const [editingGrid, setEditingGrid] = useState(false)

  const sorted = [...(schedules ?? [])].sort(
    (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || timeToMinutes(a.start) - timeToMinutes(b.start),
  )

  async function remove(id: string) {
    try {
      await userService.removeSchedule(user, id)
      void refreshSchedules()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function saveGrid(additions: ScheduleInput[], removedIds: string[]) {
    const current = await userService.listSchedules(user)
    const retained = current.filter((schedule) => !removedIds.includes(schedule.id))
    if (additions.some((addition) => retained.some((schedule) => schedulesOverlap(addition, schedule)))) {
      await refreshSchedules()
      throw new ServiceError('CONFLICT', 'Tu horario cambió. Revisa los bloques ocupados antes de guardar.')
    }
    await userService.addSchedules(user, additions)
    for (const schedule of current.filter((entry) => removedIds.includes(entry.id))) {
      await userService.removeSchedule(user, schedule.id)
    }
    await refreshSchedules()
    setEditingGrid(false)
    toast.success('Tu horario quedó guardado.')
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border bg-card">
      <p className="flex items-start gap-2 border-b p-4 text-sm leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Tus horarios son privados. Solo se usan de forma agregada para proyectar la ocupación y para darte recomendaciones a ti.
      </p>

      {scheduleError ? (
        <div className="flex items-center justify-between gap-3 p-4 text-sm">
          <span>No pudimos cargar tus clases.</span>
          <Button variant="outline" onClick={() => void refreshSchedules()}>Reintentar</Button>
        </div>
      ) : schedules === undefined ? (
        <div className="m-4 h-12 animate-pulse rounded-xl bg-muted" />
      ) : editingGrid ? null : sorted.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Aún no agregas clases.</p>
      ) : (
        <ul className="divide-y">
          {sorted.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-10 shrink-0 text-sm font-semibold">{WEEKDAYS_SHORT[s.weekday]}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{s.subject ?? s.building}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {s.start}–{s.end} · {s.building}{s.room && ` · Salón ${s.room}`}
                </span>
              </span>
              <Button size="icon" variant="ghost" className="size-11" onClick={() => remove(s.id)}>
                <Trash2 aria-hidden="true" />
                <span className="sr-only">
                  Eliminar clase del {WEEKDAYS[s.weekday].toLowerCase()} a las {s.start}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editingGrid ? (
        <ScheduleGridEditor schedules={schedules ?? []} onCancel={() => setEditingGrid(false)} onSave={saveGrid} />
      ) : (
        <Button
          variant="ghost"
          className="h-12 rounded-none border-t text-primary"
          onClick={() => setEditingGrid(true)}
          disabled={schedules === undefined || Boolean(scheduleError)}
        >
          <CalendarDays aria-hidden="true" />
          Armar horario en cuadrícula
        </Button>
      )}
    </div>
  )
}
