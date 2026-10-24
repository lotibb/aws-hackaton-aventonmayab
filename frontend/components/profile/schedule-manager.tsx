'use client'

import { FileUp, Loader2, Lock, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSchedules } from '@/hooks/use-data'
import { BUILDINGS } from '@/lib/config'
import { timeToMinutes, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/format'
import { readScheduleFile } from '@/lib/schedule-file'
import { errorMessage, userService, type ImportedClass } from '@/lib/services'
import type { User } from '@/lib/types'
import { ScheduleImportReview } from './schedule-import-review'

const SCHOOL_DAYS = [1, 2, 3, 4, 5, 6]

export function ScheduleManager({ user }: { user: User }) {
  const { data: schedules, error: scheduleError, mutate: refreshSchedules } = useSchedules(user)
  const [adding, setAdding] = useState(false)
  const [weekday, setWeekday] = useState('1')
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('10:00')
  const [building, setBuilding] = useState(BUILDINGS[0])
  const [subject, setSubject] = useState('')
  const [pending, setPending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [imported, setImported] = useState<ImportedClass[] | null>(null)

  const sorted = [...(schedules ?? [])].sort(
    (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || timeToMinutes(a.start) - timeToMinutes(b.start),
  )

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      await userService.addSchedule(user, { weekday: Number(weekday), start, end, building, subject: subject.trim() || undefined })
      toast.success('Horario agregado.')
      setSubject('')
      setAdding(false)
      void refreshSchedules()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReading(true)
    try {
      setImported(await userService.importSchedule(await readScheduleFile(file)))
      setAdding(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setReading(false)
    }
  }

  async function remove(id: string) {
    try {
      await userService.removeSchedule(user, id)
      void refreshSchedules()
    } catch (err) {
      toast.error(errorMessage(err))
    }
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
      ) : sorted.length === 0 ? (
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

      {imported ? (
        <ScheduleImportReview user={user} classes={imported} existing={schedules ?? []} onDone={() => setImported(null)} onSaved={() => void refreshSchedules()} />
      ) : adding ? (
        <form onSubmit={add} className="flex flex-col gap-3 border-t p-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sch-day">Día</Label>
              <Select value={weekday} onValueChange={(v) => v && setWeekday(v)}>
                <SelectTrigger id="sch-day" className="h-12 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHOOL_DAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {WEEKDAYS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sch-start">Inicio</Label>
              <Input id="sch-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-12" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sch-end">Fin</Label>
              <Input id="sch-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-12" required />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sch-building">Edificio</Label>
            <Select value={building} onValueChange={(v) => v && setBuilding(v)}>
              <SelectTrigger id="sch-building" className="h-12 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUILDINGS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sch-subject">Materia (opcional)</Label>
            <Input id="sch-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={60} className="h-12 text-base md:text-base" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="h-12" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 divide-x border-t">
          <Button variant="ghost" className="h-12 rounded-none text-primary" onClick={() => setAdding(true)} disabled={reading}>
            <Plus aria-hidden="true" />
            Agregar clase
          </Button>
          <Button variant="ghost" className="h-12 rounded-none text-primary" onClick={() => fileRef.current?.click()} disabled={reading}>
            {reading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileUp aria-hidden="true" />}
            {reading ? 'Leyendo horario…' : 'Subir foto o PDF'}
          </Button>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".pdf,application/pdf,image/*" className="hidden" onChange={onFile} />
    </div>
  )
}
