import { BUILDINGS } from '../config'
import { timeToMinutes } from '../format'
import { createId, readDb, writeDb } from '../mock/db'
import { deleteUser, fetchAuthSession } from 'aws-amplify/auth'
import { COLONIAS, type Colonia, type Schedule, type User, type UserMode } from '../types'
import { authService } from './authService'
import { ServiceError } from './errors'

// Name, colonia and photo are not stored in Cognito. Until the profile API exists, the sign-up
// form stashes them here and they are attached to the Cognito `sub` on first sign-in.
const PENDING_PROFILES_KEY = 'aventon-mayab:pending-profiles'

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

  /** Returns the mock profile for the signed-in Cognito user, creating it on first sign-in. */
  async getCurrentProfile(userId: string): Promise<User> {
    const existing = readDb().users.find((u) => u.id === userId)
    if (existing) return existing

    const email = await currentEmail()
    const profiles = readPendingProfiles()
    const pending = profiles[email]
    const now = new Date().toISOString()
    const user: User = {
      id: userId,
      email,
      fullName: pending?.fullName ?? nameFromEmail(email),
      colonia: pending?.colonia ?? COLONIAS[0],
      activeMode: 'pasajero',
      verified: true,
      privacyAcceptedAt: pending?.privacyAcceptedAt ?? now,
      createdAt: now,
    }
    writeDb((db) => {
      if (!db.users.some((u) => u.id === userId)) db.users.push(user)
    })
    if (pending) {
      delete profiles[email]
      writePendingProfiles(profiles)
    }
    return user
  },

  // Cognito authorizer: the userId always comes from the token's `sub`, never from the client.
  async getProfile(user: User): Promise<User> {
    const found = readDb().users.find((u) => u.id === user.id)
    if (!found) throw new ServiceError('NOT_FOUND', 'Cuenta no encontrada.')
    return found
  },

  async updateProfile(user: User, update: ProfileUpdate): Promise<User> {
    if (update.fullName !== undefined && update.fullName.trim().length < 3) {
      throw new ServiceError('INVALID_INPUT', 'Escribe tu nombre completo.')
    }
    if (update.colonia && !COLONIAS.includes(update.colonia)) throw new ServiceError('INVALID_INPUT', 'Colonia no válida.')
    const updated = writeDb((db) => {
      const found = db.users.find((u) => u.id === user.id)
      if (!found) throw new ServiceError('NOT_FOUND', 'Cuenta no encontrada.')
      if (update.fullName !== undefined) found.fullName = update.fullName.trim()
      if (update.colonia) found.colonia = update.colonia
      // Photos will be uploaded to a private S3 bucket via presigned URL.
      if (update.photoUrl !== undefined) found.photoUrl = update.photoUrl ?? undefined
      return found
    })
    return updated
  },

  async setMode(user: User, mode: UserMode): Promise<void> {
    writeDb((db) => {
      const found = db.users.find((u) => u.id === user.id)
      if (found) found.activeMode = mode
    })
  },

  /** Deletes the Cognito account and every mock record tied to it. */
  async deleteAccount(user: User): Promise<void> {
    try {
      await deleteUser()
    } catch {
      throw new ServiceError('CONFLICT', 'No pudimos eliminar tu cuenta. Vuelve a iniciar sesión e inténtalo de nuevo.')
    }
    writeDb((db) => {
      const myTripIds = new Set(db.trips.filter((t) => t.driverId === user.id).map((t) => t.id))
      for (const trip of db.trips) {
        if (myTripIds.has(trip.id) && (trip.status === 'publicado' || trip.status === 'en_curso')) trip.status = 'cancelado'
      }
      for (const r of db.requests) {
        if (r.passengerId === user.id && r.status === 'accepted') {
          const trip = db.trips.find((t) => t.id === r.tripId)
          if (trip) trip.seatsAvailable = Math.min(trip.seatsTotal, trip.seatsAvailable + 1)
        }
      }
      db.requests = db.requests.filter((r) => r.passengerId !== user.id)
      db.schedules = db.schedules.filter((s) => s.userId !== user.id)
      db.parkingEvents = db.parkingEvents.filter((e) => e.userId !== user.id)
      db.users = db.users.filter((u) => u.id !== user.id)
    })
    await authService.signOut()
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
