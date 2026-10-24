'use client'

import { Check, Loader2, Plus, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BUILDINGS } from '@/lib/config'
import { WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/format'
import { SCHEDULE_GRID_BLOCKS, SCHEDULE_GRID_DAYS, scheduleBlockKey, schedulesOverlap, type SchedulePeriod } from '@/lib/schedule-grid'
import { errorMessage, type ScheduleInput } from '@/lib/services'
import type { Schedule } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ScheduleGridEditor({
  schedules,
  onCancel,
  onSave,
}: {
  schedules: Schedule[]
  onCancel: () => void
  onSave: (additions: ScheduleInput[], removedIds: string[]) => Promise<void>
}) {
  const [subject, setSubject] = useState('')
  const [building, setBuilding] = useState(BUILDINGS[0])
  const [drafts, setDrafts] = useState<ScheduleInput[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const changed = drafts.length > 0 || removedIds.length > 0

  function toggle(period: SchedulePeriod) {
    const key = scheduleBlockKey(period)
    if (drafts.some((draft) => scheduleBlockKey(draft) === key)) {
      setDrafts((current) => current.filter((draft) => scheduleBlockKey(draft) !== key))
      return
    }
    const existing = schedules.filter((schedule) => schedulesOverlap(schedule, period))
    if (existing.length) {
      const restore = existing.every((schedule) => removedIds.includes(schedule.id))
      setRemovedIds((current) => restore
        ? current.filter((id) => !existing.some((schedule) => schedule.id === id))
        : [...new Set([...current, ...existing.map((schedule) => schedule.id)])])
      return
    }
    setDrafts((current) => [...current, { ...period, building, subject: subject.trim() || undefined }])
  }

  async function save() {
    setPending(true)
    try {
      await onSave(drafts, removedIds)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">Arma tu semana</h3>
        <p id="schedule-grid-help" className="text-sm leading-relaxed text-muted-foreground">
          Elige la materia y el edificio, y toca sus bloques de 1 h 30 min. Cambia los datos para agregar otra materia. Toca de nuevo para desmarcar.
        </p>
      </div>

      <fieldset disabled={pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="grid-subject">Materia (opcional)</Label>
          <Input id="grid-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={60} placeholder="Ej. Matemáticas" className="h-12 text-base md:text-base" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="grid-building">Edificio</Label>
          <Select value={building} onValueChange={(value) => value && setBuilding(value)} disabled={pending}>
            <SelectTrigger id="grid-building" className="w-full data-[size=default]:h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUILDINGS.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Colores del horario">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded bg-success" />Guardado</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded bg-primary" />Por agregar</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded border border-dashed border-destructive" />Por quitar</span>
      </div>

      <div className="max-h-[34rem] overflow-auto rounded-xl border" role="region" aria-label="Horario semanal, desplaza para ver todos los días y horas" tabIndex={0}>
        <table className="w-full min-w-[520px] table-fixed border-separate border-spacing-0 text-xs" aria-describedby="schedule-grid-help">
          <caption className="sr-only">Lunes a sábado, de 07:00 a 22:00, en bloques de 90 minutos.</caption>
          <thead className="sticky top-0 z-20 bg-card">
            <tr>
              <th scope="col" className="sticky left-0 z-30 w-14 border-b bg-card py-3 text-center font-medium text-muted-foreground">Hora</th>
              {SCHEDULE_GRID_DAYS.map((day) => (
                <th scope="col" key={day} className="border-b py-3 text-center font-semibold">
                  <span aria-hidden="true">{WEEKDAYS_SHORT[day]}</span><span className="sr-only">{WEEKDAYS[day]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCHEDULE_GRID_BLOCKS.map((block) => (
              <tr key={block.start}>
                <th scope="row" className="sticky left-0 z-10 border-b bg-card px-1 py-2 text-center font-normal text-muted-foreground tabular-nums">
                  <span className="block font-medium text-foreground">{block.start}</span>
                  <span className="block pt-1">{block.end}</span>
                </th>
                {SCHEDULE_GRID_DAYS.map((day) => {
                  const period = { weekday: day, ...block }
                  const existing = schedules.filter((schedule) => schedulesOverlap(schedule, period))
                  const draft = drafts.find((item) => scheduleBlockKey(item) === scheduleBlockKey(period))
                  const removing = existing.length > 0 && existing.every((schedule) => removedIds.includes(schedule.id))
                  const occupied = existing.length > 0 || Boolean(draft)
                  const entry = draft ?? existing[0]
                  const action = draft ? 'Desmarcar bloque' : removing ? 'Conservar clase' : occupied ? 'Quitar clase completa' : 'Agregar bloque'
                  const details = entry ? (draft ? [draft] : existing).map((item) => `${item.subject || 'Clase'}, ${item.building}, ${item.start} a ${item.end}`).join('; ') : 'Libre'
                  return (
                    <td key={day} className="border-b border-l p-0.5 align-top">
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={occupied && !removing}
                        aria-label={`${action}: ${WEEKDAYS[day]}, ${block.start} a ${block.end}. ${details}`}
                        title={`${action} · ${details}`}
                        onClick={() => toggle(period)}
                        className={cn(
                          'group flex h-[84px] w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border p-1 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60',
                          !occupied && 'border-transparent text-muted-foreground/40 hover:border-primary/30 hover:bg-primary/5 hover:text-primary',
                          existing.length > 0 && !removing && 'border-success/25 bg-success/10 text-foreground hover:bg-success/20',
                          draft && 'border-primary/50 bg-primary/15 text-foreground hover:bg-primary/25',
                          removing && 'border-dashed border-destructive/40 bg-destructive/5 text-muted-foreground hover:bg-destructive/10',
                        )}
                      >
                        {entry ? (
                          <>
                            {removing ? <X className="size-3 shrink-0 text-destructive" aria-hidden="true" /> : <Check className={cn('size-3 shrink-0', draft ? 'text-primary' : 'text-success')} aria-hidden="true" />}
                            <span className={cn('line-clamp-2 w-full text-[10px] leading-tight font-medium break-words hyphens-auto', removing && 'line-through')}>{entry.subject || 'Clase'}</span>
                            <span className="text-[9px] tabular-nums">{entry.start}–{entry.end}</span>
                            <span className="w-full truncate text-[9px] text-muted-foreground">{entry.building}</span>
                          </>
                        ) : <Plus className="size-3.5" aria-hidden="true" />}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">Desliza para ver toda la semana. Al quitar una clase que abarca varios bloques, se quitará completa al guardar.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {changed ? `${drafts.length} por agregar · ${removedIds.length} por quitar` : 'Toca un bloque para empezar.'}
        </p>
        {changed && <Button variant="ghost" onClick={() => { setDrafts([]); setRemovedIds([]) }} disabled={pending}><Undo2 aria-hidden="true" />Deshacer cambios</Button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button className="h-12" onClick={save} disabled={!changed || pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {pending ? 'Guardando…' : 'Guardar horario'}
        </Button>
      </div>
    </div>
  )
}
