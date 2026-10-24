import { BUILDINGS } from '../config'
import { normalizePhone, timeToMinutes } from '../format'
import { createId, notifyChange, readDb, writeDb } from '../mock/db'
import { invalidatePresence } from './parking-service'
import { fetchAuthSession } from 'aws-amplify/auth'
import { COLONIAS, type Colonia, type Schedule, type User, type UserMode } from '../types'
import { api } from './api'
import { authService } from './authService'
import { ServiceError } from './errors'

// Name, phone, colonia and photo are not stored in Cognito. The sign-up form stashes them here and
// they are saved to the profile API (keyed by the Cognito `sub`) on first sign-in.
const PENDING_PROFILES_KEY = 'aventon-mayab:pending-profiles'
const SCHEDULE_MIGRATION_KEY = 'aventon-mayab:schedules-migrated:v1'
const migratedScheduleUsers = new Set<string>()

function scheduleMigrationDone(userId: string): boolean {
  if (migratedScheduleUsers.has(userId)) return true
  try {
    return window.localStorage.getItem(`${SCHEDULE_MIGRATION_KEY}:${userId}`) === '1'
  } catch {
    return false
  }
}

function markScheduleMigrationDone(userId: string) {
  migratedScheduleUsers.add(userId)
  try {
    window.localStorage.setItem(`${SCHEDULE_MIGRATION_KEY}:${userId}`, '1')
  } catch {
    // The in-memory marker still prevents a deleted class from being restored this session.
  }
}

// Profile as stored by the API (PUT /me replaces it whole).
interface ApiProfile {
  userId: string
  email: string
  name?: string
  colonia?: Colonia
  phone?: string
  photoUrl?: string
  activeMode?: UserMode
  privacyAcceptedAt?: string
  createdAt?: string
}

function toUser(profile: ApiProfile): User {
  const now = new Date().toISOString()
  return {
    id: profile.userId,
    email: profile.email,
    fullName: profile.name ?? nameFromEmail(profile.email),
    colonia: profile.colonia ?? COLONIAS[0],
    phone: profile.phone,
    photoUrl: profile.photoUrl,
    activeMode: profile.activeMode ?? 'pasajero',
    verified: true,
    privacyAcceptedAt: profile.privacyAcceptedAt ?? profile.createdAt ?? now,
    createdAt: profile.createdAt ?? now,
  }
}

async function saveUser(user: User): Promise<User> {
  const saved = await api<ApiProfile>('/me', {
    method: 'PUT',
    body: {
      name: user.fullName,
      colonia: user.colonia,
      phone: user.phone,
      photoUrl: user.photoUrl,
      activeMode: user.activeMode,
      privacyAcceptedAt: user.privacyAcceptedAt,
    },
  })
  return toUser(saved)
}

interface PendingProfile {
  fullName: string
  phone?: string
  colonia: Colonia
  privacyAcceptedAt: string
}

function readPendingProfiles(): Record<string, PendingProfile> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(PENDING_PROFILES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writePendingProfiles(profiles: Record<string, PendingProfile>) {
  window.localStorage.setItem(PENDING_PROFILES_KEY, JSON.stringify(profiles))
}

function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function currentEmail(): Promise<string> {
  const session = await fetchAuthSession()
  const email = session.tokens?.idToken?.payload.email
  return typeof email === 'string' ? email.toLowerCase() : ''
}

export interface ProfileUpdate {
  fullName?: string
  phone?: string
  colonia?: Colonia
  photoUrl?: string | null
}

export interface ScheduleInput {
  weekday: number
  start: string
  end: string
  building: string
  subject?: string
  room?: string
}

export type ScheduleFileType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'

/** A class read from an uploaded timetable, still to be reviewed by the student. */
export interface ImportedClass {
  weekday: number
  start: string
  end: string
  subject?: string
  room?: string
  /** Only when the timetable makes it clear; otherwise the student picks it. */
  building?: string
}

interface ApiImportedClass {
  day: number
  start: string
  end: string
  subject?: string
  room?: string
  building?: string
}

interface ApiSchedule {
  userId: string
  slotId: string
  day: number
  start: string
  end: string
  subject?: string
  building?: string
  room?: string
}

function toSchedule(user: User, input: ScheduleInput): Schedule {
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) throw new ServiceError('INVALID_INPUT', 'Día no válido.')
  if (!/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) {
    throw new ServiceError('INVALID_INPUT', 'Horario no válido.')
  }
  if (timeToMinutes(input.end) <= timeToMinutes(input.start)) {
    throw new ServiceError('INVALID_INPUT', 'La hora de fin debe ser posterior a la de inicio.')
  }
  if (!BUILDINGS.includes(input.building)) throw new ServiceError('INVALID_INPUT', 'Selecciona un edificio.')
  return {
    id: createId('s'),
    userId: user.id,
    weekday: input.weekday,
    start: input.start,
    end: input.end,
    building: input.building,
    subject: input.subject?.trim().slice(0, 60) || undefined,
    room: input.room?.trim().slice(0, 40) || undefined,
  }
}

function apiScheduleOf(schedule: Schedule) {
  return {
    day: schedule.weekday || 7,
    start: schedule.start,
    end: schedule.end,
    subject: schedule.subject,
    building: schedule.building,
    room: schedule.room,
  }
}

async function saveScheduleToApi(schedule: Schedule): Promise<void> {
  await api(`/me/schedule/${encodeURIComponent(schedule.id)}`, {
    method: 'PUT',
    body: apiScheduleOf(schedule),
  })
  // Parking forecasts count everyone's classes, the student's included.
  invalidatePresence()
}

export const userService = {
  savePendingProfile(email: string, profile: { fullName: string; phone: string; colonia: Colonia }) {
    const profiles = readPendingProfiles()
    profiles[email.trim().toLowerCase()] = {
      fullName: profile.fullName.trim(),
      phone: normalizePhone(profile.phone) ?? undefined,
      colonia: profile.colonia,
      privacyAcceptedAt: new Date().toISOString(),
    }
    writePendingProfiles(profiles)
  },

  /** Returns the signed-in student's profile from the API, creating it on first sign-in. */
  async getCurrentProfile(userId: string): Promise<User> {
    const profile = await api<ApiProfile>('/me')
    if (profile.name) return toUser(profile)

    // First sign-in: use the name and colonia from sign-up, or the profile this browser
    // kept before the API existed, so nobody has to type them again.
    const email = profile.email || (await currentEmail())
    const profiles = readPendingProfiles()
    const pending = profiles[email]
    const local = readDb().users.find((u) => u.id === userId)
    const user = toUser({
      ...profile,
      email,
      name: pending?.fullName ?? local?.fullName,
      phone: pending?.phone,
      colonia: pending?.colonia ?? local?.colonia,
      photoUrl: local?.photoUrl,
      activeMode: local?.activeMode,
      privacyAcceptedAt: pending?.privacyAcceptedAt ?? local?.privacyAcceptedAt,
    })
    const saved = await saveUser(user)
    if (pending) {
      delete profiles[email]
      writePendingProfiles(profiles)
    }
    return saved
  },

  // Cognito authorizer: the userId always comes from the token's `sub`, never from the client.
  async getProfile(user: User): Promise<User> {
    return toUser(await api<ApiProfile>('/me'))
  },

  async updateProfile(user: User, update: ProfileUpdate): Promise<User> {
    if (update.fullName !== undefined && update.fullName.trim().length < 3) {
      throw new ServiceError('INVALID_INPUT', 'Escribe tu nombre completo.')
    }
    if (update.colonia && !COLONIAS.includes(update.colonia)) throw new ServiceError('INVALID_INPUT', 'Colonia no válida.')
    const phone = update.phone === undefined ? undefined : normalizePhone(update.phone)
    if (phone === null) throw new ServiceError('INVALID_INPUT', 'Escribe un celular de 10 dígitos.')
    const current = await this.getProfile(user)
    const next: User = { ...current }
    if (update.fullName !== undefined) next.fullName = update.fullName.trim()
    if (update.colonia) next.colonia = update.colonia
    if (phone) next.phone = phone
    // Photos arrive already resized to a small data URL (see profile-card).
    if (update.photoUrl !== undefined) next.photoUrl = update.photoUrl ?? undefined
    const saved = await saveUser(next)
    notifyChange()
    return saved
  },

  async setMode(user: User, mode: UserMode): Promise<User> {
    const current = await this.getProfile(user)
    const saved = await saveUser({ ...current, activeMode: mode })
    notifyChange()
    return saved
  },

  /** The API deletes every record tied to the account, and the Cognito user itself. */
  async deleteAccount(user: User): Promise<void> {
    try {
      await api('/me', { method: 'DELETE' })
    } catch {
      throw new ServiceError('CONFLICT', 'No pudimos eliminar tu cuenta. Vuelve a iniciar sesión e inténtalo de nuevo.')
    }
    // Clear the local schedule cache and parking check-ins after deleting the account.
    writeDb((db) => {
      db.schedules = db.schedules.filter((s) => s.userId !== user.id)
      db.parkingEvents = db.parkingEvents.filter((e) => e.userId !== user.id)
      db.users = db.users.filter((u) => u.id !== user.id)
    })
    // The Cognito user is already gone, so revoking its tokens may fail; the local session is cleared anyway.
    await authService.signOut().catch(() => {})
  },

  // Schedules are private: the API only reads the signed-in student's partition key.
  async listSchedules(user: User): Promise<Schedule[]> {
    const cached = readDb().schedules.filter((s) => s.userId === user.id)
    let remote = await api<ApiSchedule[]>('/me/schedule')
    // Copy classes from the old browser-only version just once. Repeating this on each
    // refresh would recreate classes another device deleted from the account.
    if (!scheduleMigrationDone(user.id)) {
      const remoteTimes = new Set(remote.map((s) => `${s.day}|${s.start}|${s.end}`))
      const localOnly = cached.filter((s) => !remoteTimes.has(`${s.weekday || 7}|${s.start}|${s.end}`))
      if (localOnly.length) {
        for (const schedule of localOnly) await saveScheduleToApi(schedule)
        remote = await api<ApiSchedule[]>('/me/schedule')
      }
      markScheduleMigrationDone(user.id)
    }
    const cachedById = new Map(cached.map((s) => [s.id, s]))
    const schedules = remote.map((s) => ({
      id: s.slotId,
      userId: user.id,
      weekday: s.day % 7,
      start: s.start,
      end: s.end,
      subject: s.subject,
      building: s.building ?? cachedById.get(s.slotId)?.building ?? 'Sin edificio',
      room: s.room ?? cachedById.get(s.slotId)?.room,
    })).sort((a, b) => a.weekday - b.weekday || timeToMinutes(a.start) - timeToMinutes(b.start))
    // Writing the cache notifies every screen to refetch, which calls this again:
    // only write when the classes changed, or the app reloads forever.
    if (JSON.stringify(cached) !== JSON.stringify(schedules)) {
      writeDb((db) => {
        db.schedules = [...db.schedules.filter((s) => s.userId !== user.id), ...schedules]
      })
    }
    return schedules
  },

  async addSchedule(user: User, input: ScheduleInput): Promise<Schedule> {
    const [schedule] = await this.addSchedules(user, [input])
    return schedule
  },

  /** Adds several classes to the student's account; a failed batch rolls back its saved slots. */
  async addSchedules(user: User, inputs: ScheduleInput[]): Promise<Schedule[]> {
    const schedules = inputs.map((input) => toSchedule(user, input))
    const saved: Schedule[] = []
    try {
      for (const schedule of schedules) {
        await saveScheduleToApi(schedule)
        saved.push(schedule)
      }
    } catch (error) {
      await Promise.allSettled(saved.map((schedule) => api(`/me/schedule/${encodeURIComponent(schedule.id)}`, { method: 'DELETE' })))
      throw error
    }
    writeDb((db) => {
      db.schedules.push(...schedules)
    })
    return schedules
  },

  /** Reads a timetable (PDF or image, base64) on the API. Nothing is saved until the student confirms. */
  async importSchedule(file: { data: string; mediaType: ScheduleFileType }): Promise<ImportedClass[]> {
    const { classes } = await api<{ classes: ApiImportedClass[] }>('/me/schedule/import', {
      method: 'POST',
      body: { file: file.data, mediaType: file.mediaType, buildings: BUILDINGS },
    })
    return classes.map((c) => ({
      // The API counts days 1 (lunes) to 7 (domingo); the app uses 0 (domingo) to 6.
      weekday: c.day % 7,
      start: c.start,
      end: c.end,
      subject: c.subject,
      room: c.room,
      building: c.building,
    }))
  },

  async removeSchedule(user: User, scheduleId: string): Promise<void> {
    const found = readDb().schedules.find((s) => s.id === scheduleId)
    if (!found || found.userId !== user.id) throw new ServiceError('FORBIDDEN', 'No puedes modificar este horario.')
    await api(`/me/schedule/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' })
    invalidatePresence()
    writeDb((db) => {
      db.schedules = db.schedules.filter((s) => s.id !== scheduleId)
    })
  },
}
