// Run from frontend/: node scripts/check-parking.cjs
const ts = require('typescript')
const fs = require('node:fs')
const assert = require('node:assert/strict')

require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
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

// The HTTP boundary is stubbed, not AWS: verify that the actual service uses
// authenticated requests and never reads or changes the legacy parking counts.
process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID = 'us-east-1_test'
process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = 'testclient'
process.env.NEXT_PUBLIC_API_URL = 'https://parking.example.test'
const { authService } = require('../lib/services/authService.ts')
authService.getToken = async () => 'test-token'
const { parkingService } = require('../lib/services/parking-service.ts')
const { toOccupancies } = require('../lib/services/parking-api.ts')
const responses = []
const requests = []
global.fetch = async (url, options) => {
  requests.push({ url, ...options })
  assert.equal(options.headers.Authorization, 'Bearer test-token')
  const response = responses.shift()
  assert.ok(response, 'Unexpected HTTP request')
  return new Response(JSON.stringify(response.body), { status: response.status ?? 200 })
}
async function checkApi() {
  const localBefore = stored
  const rows = PARKING_ZONES.map((zone) => ({ zoneId: zone.id, name: zone.name, capacity: zone.capacity,
    capacityEstimated: true, occupied: 1, available: zone.capacity - 1,
    occupancyPercentage: Math.round(100 / zone.capacity), source: 'registrado', sensorOnline: false }))
  responses.push({ body: [...rows].reverse() })
  const zones = await parkingService.getZonesOccupancy(db.users[0])
  assert.equal(requests.at(-1).cache, 'no-store')
  assert.deepEqual(zones.map((z) => z.zone.id), PARKING_ZONES.map((z) => z.id))
  assert.ok(zones.every((z) => z.occupied === 1 && z.source === 'registrado'))
  assert.throws(() => toOccupancies(rows.filter((z) => z.zoneId !== 'P9')), /P9/)
  assert.throws(() => toOccupancies(rows.map((z) => ({ ...z, occupied: null }))))
  for (const zoneId of ['P9', 'P10']) {
    responses.push({ body: { session: { zoneId, enteredAt: '2026-01-01T00:00:00Z' } } })
    await parkingService.checkIn(db.users[0], zoneId)
    assert.equal(requests.at(-1).url, 'https://parking.example.test/parking/entry')
    assert.deepEqual(JSON.parse(requests.at(-1).body), { zoneId })
    responses.push({ body: { session: { zoneId, zoneName: zoneId, enteredAt: '2026-01-01T00:00:00Z' } } })
    assert.equal((await parkingService.getMyActiveEntry(db.users[0])).zoneId, zoneId)
    responses.push({ status: 409, body: { message: 'Ya tienes una entrada activa' } })
    await assert.rejects(() => parkingService.checkIn(db.users[0], zoneId), (error) => error.code === 'CONFLICT')
    responses.push({ body: { session: { zoneId }, exitedAt: '2026-01-01T01:00:00Z', minutes: 60 } })
    await parkingService.checkOut(db.users[0])
    assert.equal(requests.at(-1).url, 'https://parking.example.test/parking/exit')
    assert.equal(requests.at(-1).body, undefined, 'Exit must use the server session, not the selected zone')
    responses.push({ body: { session: null } })
    assert.equal(await parkingService.getMyActiveEntry(db.users[0]), null)
  }
  responses.push({ body: { session: { zoneId: 'A', zoneName: 'Zona antigua', enteredAt: '2026-01-01T00:00:00Z' } } })
  assert.equal((await parkingService.getMyActiveEntry(db.users[0])).zoneName, 'Zona antigua')
  responses.push({ status: 500, body: { message: 'Error interno' } })
  await assert.rejects(() => parkingService.getZonesOccupancy(db.users[0]), /Error interno/)
  assert.equal(stored, localBefore, 'Real parking calls must not mutate the mock DB')
  assert.equal(responses.length, 0)
  console.log('PASS: legacy migration; ten-zone forecasts; authenticated parking API calls, server counts, legacy sessions, conflicts and errors without local fallback (stubbed HTTP).')
}
checkApi().catch((error) => { console.error(error); process.exitCode = 1 })
