import type { TripStatus } from './types'

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Local date + HH:mm → ISO 8601 UTC string. */
export function toDepartureTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

export function localDateOf(iso: string): string {
  return toIsoDate(new Date(iso))
}

export function localTimeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatTripDate(iso: string): string {
  const today = toIsoDate(new Date())
  const tomorrow = toIsoDate(addDays(new Date(), 1))
  const yesterday = toIsoDate(addDays(new Date(), -1))
  if (iso === today) return 'Hoy'
  if (iso === tomorrow) return 'Mañana'
  if (iso === yesterday) return 'Ayer'
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(parseIsoDate(iso))
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

export function formatRelative(iso: string, now: number): string {
  const diffMin = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (diffMin < 1) return 'hace unos segundos'
  if (diffMin < 60) return `hace ${diffMin} min`
  const hours = Math.round(diffMin / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} d`
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

/** 10-digit Mexican mobile number from what the student typed (+52, spaces and dashes allowed), or null. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  const national = digits.length > 10 && /^521?/.test(digits) ? digits.replace(/^521?/, '') : digits
  return national.length === 10 ? national : null
}

/** "9991234567" → "999 123 4567" */
export function formatPhone(phone: string): string {
  return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name
}

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  publicado: 'Publicado',
  solicitud_pendiente: 'Solicitud pendiente',
  aceptado: 'Aceptado',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
}
