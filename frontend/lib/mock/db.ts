import { createSeed, type DbState } from './seed'

/**
 * In-memory mock backend. Persisted to localStorage only so the demo survives refreshes.
 * In production this whole module disappears: data lives in DynamoDB behind API Gateway + Lambda,
 * and change notifications arrive via AWS IoT Core / WebSocket subscriptions.
 */
const STORAGE_KEY = 'aventon-mayab:db:v2'

type Listener = () => void

let state: DbState | null = null
const listeners = new Set<Listener>()

function load(): DbState {
  if (typeof window === 'undefined') return createSeed()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as DbState
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

/** Runs a mutation synchronously (single-threaded, so it behaves atomically), then broadcasts. */
export function writeDb<T>(mutate: (db: DbState) => T): T {
  const db = readDb()
  const result = mutate(db)
  persist(db)
  emit()
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
