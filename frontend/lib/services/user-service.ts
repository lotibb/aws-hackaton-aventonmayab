import { BUILDINGS } from '../config'
import { timeToMinutes } from '../format'
import { createId, notifyChange, readDb, writeDb } from '../mock/db'
import { fetchAuthSession } from 'aws-amplify/auth'
import { COLONIAS, type Colonia, type Schedule, type User, type UserMode } from '../types'
import { api } from './api'
import { authService } from './authService'
import { ServiceError } from './errors'

// Name, colonia and photo are not stored in Cognito. The sign-up form stashes them here and
// they are saved to the profile API (keyed by the Cognito `sub`) on first sign-in.
const PENDING_PROFILES_KEY = 'aventon-mayab:pending-profiles'

// Profile as stored by the API (PUT /me replaces it whole).
interface ApiProfile {
  userId: string
  email: string
  name?: string
  colonia?: Colonia
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
      photoUrl: user.photoUrl,
      activeMode: user.activeMode,
      privacyAcceptedAt: user.privacyAcceptedAt,
    },
  })
  return toUser(saved)
}

interface PendingProfile {
  fullName: string
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
  colonia?: Colonia
  photoUrl?: string | null
}

export interface ScheduleInput {
  weekday: number
  start: string
  end: string
  building: string
  subject?: string
}

export const userService = {
  savePendingProfile(email: string, profile: { fullName: string; colonia: Colonia }) {
    const profiles = readPendingProfiles()
    profiles[email.trim().toLowerCase()] = {
      fullName: profile.fullName.trim(),
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
    const current = await this.getProfile(user)
    const next: User = { ...current }
    if (update.fullName !== undefined) next.fullName = update.fullName.trim()
    if (update.colonia) next.colonia = update.colonia
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
    // Schedules and parking check-ins still live in this browser until their APIs are connected.
    writeDb((db) => {
      db.schedules = db.schedules.filter((s) => s.userId !== user.id)
      db.parkingEvents = db.parkingEvents.filter((e) => e.userId !== user.id)
      db.users = db.users.filter((u) => u.id !== user.id)
    })
    // The Cognito user is already gone, so revoking its tokens may fail; the local session is cleared anyway.
    await authService.signOut().catch(() => {})
  },

  // Schedules are private: the authorizer restricts every query to the owner's partition key.
  async listSchedules(user: User): Promise<Schedule[]> {
    return readDb()
      .schedules.filter((s) => s.userId === user.id)
      .sort((a, b) => a.weekday - b.weekday || timeToMinutes(a.start) - timeToMinutes(b.start))
  },

  async addSchedule(user: User, input: ScheduleInput): Promise<Schedule> {
    if (input.weekday < 0 || input.weekday > 6) throw new ServiceError('INVALID_INPUT', 'Día no válido.')
    if (!/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) {
      throw new ServiceError('INVALID_INPUT', 'Horario no válido.')
    }
    if (timeToMinutes(input.end) <= timeToMinutes(input.start)) {
      throw new ServiceError('INVALID_INPUT', 'La hora de fin debe ser posterior a la de inicio.')
    }
    if (!BUILDINGS.includes(input.building)) throw new ServiceError('INVALID_INPUT', 'Selecciona un edificio.')
    const schedule: Schedule = {
      id: createId('s'),
      userId: user.id,
      weekday: input.weekday,
      start: input.start,
      end: input.end,
      building: input.building,
      subject: input.subject?.trim().slice(0, 60) || undefined,
    }
    writeDb((db) => {
      db.schedules.push(schedule)
    })
    return schedule
  },

  async removeSchedule(user: User, scheduleId: string): Promise<void> {
    writeDb((db) => {
      const found = db.schedules.find((s) => s.id === scheduleId)
      if (!found || found.userId !== user.id) throw new ServiceError('FORBIDDEN', 'No puedes modificar este horario.')
      db.schedules = db.schedules.filter((s) => s.id !== scheduleId)
    })
  },
}
