import { test } from "node:test";
import assert from "node:assert/strict";
import { parseZoneId, presentZone } from "../src/domain";
test("no inventa disponibilidad cuando la capacidad no se conoce", () => {
  const zone = presentZone({ zoneId: "A", name: "Zona A", occupied: 8, updatedAt: "now" });
  assert.equal(zone.available, null);
  assert.equal(zone.occupancyPercentage, null);
  assert.equal(zone.capacity, null);
});
test("calcula disponibilidad con capacidad configurada", () => {
  const zone = presentZone({ zoneId: "A", name: "Zona A", occupied: 8, capacity: 10, updatedAt: "now" });
  assert.equal(zone.available, 2);
  assert.equal(zone.occupancyPercentage, 80);
});
test("rechaza cuerpos inválidos e identificadores no válidos", () => {
  for (const value of [undefined, "null", "[]", "{", '{"zoneId":"../A"}', '{"zoneId":42}']) assert.throws(() => parseZoneId(value));
  assert.equal(parseZoneId('{"zoneId":"zona-A"}'), "zona-A");
});
