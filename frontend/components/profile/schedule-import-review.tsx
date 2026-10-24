'use client'

import { Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BUILDINGS } from '@/lib/config'
import { timeToMinutes, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/format'
import { errorMessage, userService, type ImportedClass } from '@/lib/services'
import type { Schedule, User } from '@/lib/types'

interface Row extends ImportedClass {
  key: string
  include: boolean
  duplicate: boolean
}

function toRows(classes: ImportedClass[], existing: Schedule[]): Row[] {
  return [...classes]
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || timeToMinutes(a.start) - timeToMinutes(b.start))
    .map((c) => {
      const duplicate = existing.some((s) => s.weekday === c.weekday && s.start === c.start && s.end === c.end)
      return { ...c, key: `${c.weekday}-${c.start}-${c.end}`, include: !duplicate, duplicate }
    })
}

export function ScheduleImportReview({
  user,
  classes,
  existing,
  onDone,
  onSaved,
}: {
  user: User
  classes: ImportedClass[]
  existing: Schedule[]
  onDone: () => void
  onSaved: () => void
}) {
  const [rows, setRows] = useState(() => toRows(classes, existing))
  const [pending, setPending] = useState(false)

  const selected = rows.filter((r) => r.include)
  const missingBuilding = selected.filter((r) => !r.building).length

  function update(key: string, change: Partial<Row>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...change } : r)))
  }

  function fillBuildings(building: string) {
    setRows((current) => current.map((r) => (r.building ? r : { ...r, building })))
  }

  async function save() {
    if (missingBuilding > 0) return toast.error('Elige el edificio de cada clase que vas a agregar.')
    setPending(true)
    try {
      await userService.addSchedules(
        user,
        selected.map((r) => ({ weekday: r.weekday, start: r.start, end: r.end, building: r.building!, subject: r.subject, room: r.room })),
      )
      toast.success(selected.length === 1 ? 'Se agregó 1 clase.' : `Se agregaron ${selected.length} clases.`)
      onDone()
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t p-4">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Encontramos {rows.length === 1 ? '1 clase' : `${rows.length} clases`}
        </p>
        <p className="text-sm text-muted-foreground">Revisa que los días y las horas coincidan antes de agregarlas.</p>
      </div>

      {missingBuilding > 0 && (
        <Select value={null} onValueChange={(v) => v && fillBuildings(v)}>
          <SelectTrigger className="h-12 w-full" aria-label="Edificio para las clases sin edificio">
            <SelectValue placeholder="Usar un edificio en las que faltan" />
          </SelectTrigger>
          <SelectContent>
            {BUILDINGS.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <ul className="flex flex-col divide-y rounded-xl border">
        {rows.map((r) => {
          const id = `import-${r.key}`
          return (
            <li key={r.key} className="flex flex-col gap-2 p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id={id}
                  checked={r.include}
                  onCheckedChange={(v) => update(r.key, { include: Boolean(v) })}
                  className="mt-0.5 size-5"
                />
                <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{r.subject ?? 'Clase sin nombre'}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    <span aria-hidden="true">{WEEKDAYS_SHORT[r.weekday]}</span>
                    <span className="sr-only">{WEEKDAYS[r.weekday]}</span> · {r.start}–{r.end}
                    {r.room && ` · ${r.room}`}
                    {r.duplicate && ' · Ya está en tu horario'}
                  </span>
                </label>
              </div>
              {r.include && (
                <Select value={r.building ?? null} onValueChange={(v) => v && update(r.key, { building: v })}>
                  <SelectTrigger className="ml-8 h-11 w-[calc(100%-2rem)]" aria-label={`Edificio de ${r.subject ?? 'la clase'}`}>
                    <SelectValue placeholder="Elige el edificio" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUILDINGS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </li>
          )
        })}
      </ul>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" className="h-12" onClick={save} disabled={pending || selected.length === 0}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {selected.length === 1 ? 'Agregar 1 clase' : `Agregar ${selected.length} clases`}
        </Button>
      </div>
    </div>
  )
}
