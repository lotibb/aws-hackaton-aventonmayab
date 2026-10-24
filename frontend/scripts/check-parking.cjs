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
const { parkingService } = require('../lib/services/parking-service.ts')
parkingService.getZonesOccupancy(db.users[0]).then(async (zones) => {
  assert.equal(zones.length, 10)
  for (const occupancy of zones) {
    assert.ok(occupancy.occupied >= 0 && occupancy.occupied <= occupancy.zone.capacity)
    assert.ok(Number.isFinite(occupancy.percentage))
    assert.equal(occupancy.source, 'simulado')
  }
  for (const zoneId of ['P9', 'P10']) {
    await parkingService.checkIn(db.users[0], zoneId)
    assert.equal((await parkingService.getMyActiveEntry(db.users[0])).zoneId, zoneId)
    await assert.rejects(() => parkingService.checkIn(db.users[0], zoneId))
    await parkingService.checkOut(db.users[0])
    assert.equal(await parkingService.getMyActiveEntry(db.users[0]), null)
  }
  console.log('PASS: legacy migration preserves user data and active entry; ten zones have valid occupancy and seven-day forecasts; P9/P10 entry, duplicate protection and exit work.')
}).catch((error) => { console.error(error); process.exitCode = 1 })
