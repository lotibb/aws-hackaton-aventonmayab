import { createSeed, type DbState } from './seed'
import { getZone, PARKING_ZONES } from '../config'
import type { ZoneId } from '../types'

/**
 * In-memory mock backend. Persisted to localStorage only so the demo survives refreshes.
 * In production this whole module disappears: data lives in DynamoDB behind API Gateway + Lambda,
 * and change notifications arrive via AWS IoT Core / WebSocket subscriptions.
 */
const STORAGE_KEY = 'aventon-mayab:db:v2'

/** Compatibility aliases for the old demo, not an official geographic equivalence. */
const LEGACY_ZONES: Record<string, ZoneId> = { A: 'P7', B: 'P8', C: 'P3', D: 'P4' }

function migrateParking(db: DbState): DbState {
  const seed = createSeed()
  const resolve = (id: ZoneId): ZoneId => LEGACY_ZONES[id] ?? id
  // Only migrate parking fields; profiles, schedules, trips and requests stay intact.
  const counters = { ...db.sensorCounters }
  const statuses = { ...db.sensorStatus }
  const estimates = { ...db.manualEstimates }
  for (const zone of PARKING_ZONES) {
    const legacy = Object.keys(LEGACY_ZONES).find((id) => LEGACY_ZONES[id] === zone.id)
    const oldId = legacy as ZoneId | undefined
    db.sensorCounters[zone.id] = counters[zone.id] ?? (oldId && counters[oldId]) ?? seed.sensorCounters[zone.id]
    const status = statuses[zone.id] ?? (oldId && statuses[oldId]) ?? seed.sensorStatus[zone.id]
    db.sensorStatus[zone.id] = { ...status, zoneId: zone.id }
    db.manualEstimates[zone.id] = Math.min(zone.capacity, Math.max(0,
      estimates[zone.id] ?? (oldId ? estimates[oldId] : undefined) ?? seed.manualEstimates[zone.id],
    ))
  }
  db.parkingEvents = db.parkingEvents.map((event) => ({ ...event, zoneId: resolve(event.zoneId) }))
  db.sensorEvents = db.sensorEvents.map((event) => {
    const zoneId = resolve(event.zoneId)
    const zone = getZone(zoneId)
    return { ...event, zoneId, counterId: event.sensorType === 'entrada' ? zone.entranceCounterId : zone.exitCounterId }
  })
  for (const legacy of Object.keys(LEGACY_ZONES)) {
    delete (db.sensorCounters as Record<string, unknown>)[legacy]
    delete (db.sensorStatus as Record<string, unknown>)[legacy]
    delete (db.manualEstimates as Record<string, unknown>)[legacy]
  }
  return db
}

type Listener = () => void

let state: DbState | null = null
const listeners = new Set<Listener>()

function load(): DbState {
  if (typeof window === 'undefined') return createSeed()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const migrated = migrateParking(JSON.parse(raw) as DbState)
      persist(migrated)
      return migrated
    }
  } catch {
    // Corrupted storage falls back to a fresh seed.
  }
  const seed = createSeed()
  persist(seed)
  return seed
}

function persist(next: DbState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage quota exceeded: keep working in memory.
  }
}

export function readDb(): DbState {
  if (!state) state = load()
  return state
}

/**
 * Runs a mutation synchronously (single-threaded, so it behaves atomically), then broadcasts.
 * Pass `notify: false` to refresh a local cache without making every screen refetch.
 */
export function writeDb<T>(mutate: (db: DbState) => T, { notify = true }: { notify?: boolean } = {}): T {
  const db = readDb()
  const result = mutate(db)
  persist(db)
  if (notify) emit()
  return result
}

export function resetDb() {
  state = createSeed()
  persist(state)
  emit()
}

export function subscribeDb(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const l of listeners) l()
}

export const notifyChange = emit

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    state = null
    emit()
  })
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}
