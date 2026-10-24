// Run from frontend/: node scripts/check-parking.cjs
const ts = require('typescript')
const fs = require('node:fs')
const assert = require('node:assert/strict')

require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  filename,
)

const { createSeed } = require('../lib/mock/seed.ts')
const { PARKING_ZONES } = require('../lib/config.ts')
const { aggregateSchedules, buildForecast } = require('../lib/projections.ts')
const previous = createSeed()
const aliases = { P7: 'A', P8: 'B', P3: 'C', P4: 'D' }
for (const field of ['sensorCounters', 'sensorStatus', 'manualEstimates']) {
  const values = previous[field]
  previous[field] = {}
  for (const [current, legacy] of Object.entries(aliases)) {
    previous[field][legacy] = values[current]
    if (field === 'sensorStatus') previous[field][legacy].zoneId = legacy
  }
}
previous.parkingEvents = previous.parkingEvents.map((event) => ({ ...event, zoneId: aliases[event.zoneId] }))
previous.sensorEvents = previous.sensorEvents.filter((event) => aliases[event.zoneId])
  .map((event) => ({ ...event, zoneId: aliases[event.zoneId] }))

const unchanged = Object.fromEntries(['users', 'trips', 'requests', 'schedules'].map((field) => [field, JSON.stringify(previous[field])]))
let stored = JSON.stringify(previous)
global.window = {
  localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value } },
  addEventListener: () => {},
}
const { readDb } = require('../lib/mock/db.ts')
const db = readDb()
for (const [field, value] of Object.entries(unchanged)) assert.equal(JSON.stringify(db[field]), value)
assert.equal(db.parkingEvents[0].zoneId, 'P8', 'Active demo entry survives migration')
assert.equal(Object.keys(db.sensorCounters).length, 10)
const agg = aggregateSchedules(db.schedules)
for (const zone of PARKING_ZONES) {
  assert.ok(db.sensorStatus[zone.id])
  assert.ok(Number.isFinite(db.manualEstimates[zone.id]))
  for (let day = 0; day < 7; day++) {
    const points = buildForecast(agg, zone.id, day)
    assert.ok(points.length > 0)
    assert.ok(points.every((point) => Number.isFinite(point.percentage) && point.percentage >= 0 && point.percentage <= 100))
  }
}
// The backend creates the zones; they must match the app's (ids, capacities, names).
const backend = fs.readFileSync(require('node:path').join(__dirname, '../../backend/src/parking.mjs'), 'utf8')
const backendZones = [...backend.matchAll(/zoneId: "(P\d+)", name: "([^"]+)", area: "[^"]+", capacity: (\d+), demo: \{ sensorCount: (\d+), manualCount: (\d+) \}/g)]
  .map(([, zoneId, name, capacity, sensorCount, manualCount]) => ({ zoneId, name, capacity: +capacity, sensorCount: +sensorCount, manualCount: +manualCount }))
assert.deepEqual(backendZones.map((z) => [z.zoneId, z.name, z.capacity]), PARKING_ZONES.map((z) => [z.id, z.name, z.capacity]), 'backend/src/parking.mjs zones match lib/config.ts')
for (const z of backendZones) assert.ok(z.sensorCount <= z.capacity && z.manualCount <= z.capacity, `${z.zoneId} demo counts fit`)

// Parking now runs on the API: answer its routes the way backend/src/parking.mjs does.
process.env.NEXT_PUBLIC_API_URL = 'http://api.test'
let session = null
const calls = []
const zonesFromApi = backendZones.map((z) => ({ ...z, area: '', sensorOnline: z.zoneId !== 'P4', lastReadingAt: new Date().toISOString(), recentEvents: [] }))
global.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname
  const method = init.method ?? 'GET'
  const body = init.body ? JSON.parse(init.body) : undefined
  calls.push(`${method} ${path}`)
  const reply = (status, data) => ({ ok: status < 400, status, json: async () => data })
  if (method === 'GET' && path === '/parking/zones') return reply(200, [...zonesFromApi, { zoneId: 'TEST-x', capacity: 5 }])
  if (method === 'GET' && path === '/parking/session') return reply(200, { session })
  if (method === 'POST' && path === '/parking/entry') {
    if (session) return reply(409, { message: 'Ya tienes una entrada activa. Registra tu salida primero.' })
    session = { userId: 'u', zoneId: body.zoneId, enteredAt: new Date().toISOString() }
    return reply(200, { session })
  }
  if (method === 'POST' && path === '/parking/exit') {
    if (!session) return reply(409, { message: 'No tienes una entrada activa' })
    const old = session
    session = null
    return reply(200, { session: old })
  }
  return reply(404, { message: 'Ruta no encontrada' })
}
const { parkingService } = require('../lib/services/parking-service.ts')
parkingService.getZonesOccupancy(db.users[0]).then(async (zones) => {
  assert.deepEqual(zones.map((z) => z.zone.id), PARKING_ZONES.map((z) => z.id), 'only the ten campus zones, in order')
  for (const occupancy of zones) {
    assert.ok(occupancy.occupied >= 0 && occupancy.occupied <= occupancy.zone.capacity)
    assert.ok(Number.isFinite(occupancy.percentage))
    // Sensors online show the simulator's count; offline, the manual estimate.
    const api = zonesFromApi.find((z) => z.zoneId === occupancy.zone.id)
    assert.equal(occupancy.source, api.sensorOnline ? 'simulado' : 'estimado')
    assert.equal(occupancy.occupied, api.sensorOnline ? api.sensorCount : api.manualCount)
  }
  for (const zoneId of ['P9', 'P10']) {
    await parkingService.checkIn(db.users[0], zoneId)
    assert.equal((await parkingService.getMyActiveEntry(db.users[0])).zoneId, zoneId)
    await assert.rejects(() => parkingService.checkIn(db.users[0], zoneId))
    await parkingService.checkOut(db.users[0])
    assert.equal(await parkingService.getMyActiveEntry(db.users[0]), null)
  }
  assert.ok(calls.includes('POST /parking/entry') && calls.includes('POST /parking/exit'))
  console.log('PASS: legacy migration preserves user data; ten zones match the backend and have valid occupancy and seven-day forecasts; P9/P10 entry, duplicate protection and exit go through the API.')
}).catch((error) => { console.error(error); process.exitCode = 1 })
