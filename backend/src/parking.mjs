import { GetCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, tables } from "./lib/db.mjs";
import { caller, HttpError, isConditionFailed, readBody, router } from "./lib/http.mjs";
import { enterParking, getParkingSession, leaveParking, listParkingZones, presentZone } from "./lib/parking-store.mjs";
import catalog from "./lib/parking-catalog.json" with { type: "json" };

async function registerEntry(event) {
  const body = readBody(event);
  const zoneId = body?.zoneId;
  if (typeof zoneId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(zoneId)) throw new HttpError(400, "Zona inválida");
  return { session: await enterParking(caller(event).userId, zoneId) };
}

// Existing aggregate schedule endpoint: no individual schedules leave this Lambda.
const SLOT = 10;
const DAY_START = 360;
const DAY_END = 1260;
const ARRIVAL_LEAD = 20;
const DEPARTURE_LAG = 10;
const PRESENCE_TTL_MS = 60_000;
let presenceCache;
const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

async function presence() {
  if (presenceCache && Date.now() - presenceCache.at < PRESENCE_TTL_MS) return presenceCache.data;
  const slots = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new ScanCommand({
      TableName: tables.schedules, ProjectionExpression: "#d, #s, #e",
      ExpressionAttributeNames: { "#d": "day", "#s": "start", "#e": "end" }, ExclusiveStartKey,
    }));
    slots.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const byWeekday = {};
  let max = 1;
  for (let weekday = 0; weekday < 7; weekday++) {
    const day = slots.filter((s) => s.day % 7 === weekday);
    const counts = [];
    for (let m = DAY_START; m <= DAY_END; m += SLOT) {
      const count = day.filter((s) => toMinutes(s.start) - ARRIVAL_LEAD <= m && m < toMinutes(s.end) + DEPARTURE_LAG).length;
      counts.push(count);
      max = Math.max(max, count);
    }
    byWeekday[weekday] = counts;
  }
  const data = { byWeekday, max };
  presenceCache = { at: Date.now(), data };
  return data;
}

// Preserve the existing simulator API, isolated from registeredOccupied and sessions.
const RECENT_EVENTS = 10;
const SENSOR_TYPES = ["entrada", "salida"];
const counterId = (zoneId, type) => `cnt-${zoneId}-${type === "entrada" ? "in" : "out"}`;
const DEMO_COUNTS = [[35, 31], [53, 50], [28, 31], [34, 26], [70, 68], [18, 17], [48, 46], [22, 20], [30, 29], [14, 13]];

async function loadZone(zoneId) {
  const { Item } = await db.send(new GetCommand({ TableName: tables.parkingZones, Key: { zoneId }, ConsistentRead: true }));
  if (!Item) throw new HttpError(404, "Zona no encontrada");
  return Item;
}

async function updateZoneVersioned(zoneId, change) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60 * attempt));
    const zone = await loadZone(zoneId);
    const next = change(zone);
    if (!next) return presentZone(zone);
    const version = zone.version ?? 0;
    try {
      await db.send(new UpdateCommand({
        TableName: tables.parkingZones, Key: { zoneId },
        UpdateExpression: "SET sensorCount = :count, lastReadingAt = :at, recentEvents = :events, version = :next",
        ConditionExpression: "attribute_not_exists(version) OR version = :version",
        ExpressionAttributeValues: { ":count": next.sensorCount, ":at": next.lastReadingAt, ":events": next.recentEvents, ":version": version, ":next": version + 1 },
      }));
      return presentZone({ ...zone, ...next });
    } catch (error) {
      if (!isConditionFailed(error)) throw error;
    }
  }
  throw new HttpError(409, "Llegaron varias lecturas al mismo tiempo, intenta de nuevo");
}

async function sensorEvent(event) {
  const { zoneId, sensorType } = readBody(event);
  if (typeof zoneId !== "string" || !zoneId) throw new HttpError(400, "Falta la zona");
  if (!SENSOR_TYPES.includes(sensorType)) throw new HttpError(400, "sensorType debe ser entrada o salida");
  return updateZoneVersioned(zoneId, (zone) => {
    if (zone.sensorOnline !== true) throw new HttpError(409, "Los sensores de esta zona están fuera de línea.");
    const count = zone.sensorCount ?? 0;
    if (sensorType === "salida" && count <= 0 || sensorType === "entrada" && count >= zone.capacity) return null;
    const timestamp = new Date().toISOString();
    const reading = { id: `se-${zoneId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, sensorType, counterId: counterId(zoneId, sensorType), timestamp };
    return { sensorCount: count + (sensorType === "entrada" ? 1 : -1), lastReadingAt: timestamp, recentEvents: [reading, ...(zone.recentEvents ?? [])].slice(0, RECENT_EVENTS) };
  });
}

async function setSensorOnline(event) {
  const { online } = readBody(event);
  if (typeof online !== "boolean") throw new HttpError(400, "online debe ser true o false");
  try {
    const { Attributes } = await db.send(new UpdateCommand({
      TableName: tables.parkingZones, Key: { zoneId: event.pathParameters.zoneId },
      UpdateExpression: "SET sensorOnline = :online", ConditionExpression: "attribute_exists(zoneId)",
      ExpressionAttributeValues: { ":online": online }, ReturnValues: "ALL_NEW",
    }));
    return presentZone(Attributes);
  } catch (error) {
    if (isConditionFailed(error)) throw new HttpError(404, "Zona no encontrada");
    throw error;
  }
}

async function resetDemo() {
  // Never Put/replace a zone: that would erase real occupancy and configured capacity.
  return Promise.all(catalog.map(async (zone, index) => {
    const [sensorCount, manualCount] = DEMO_COUNTS[index];
    const timestamp = new Date().toISOString();
    const recentEvents = Array.from({ length: 6 }, (_, k) => {
      const sensorType = k % 4 === 3 ? "salida" : "entrada";
      return { id: `se-${zone.id}-${Date.now()}-${k}`, sensorType, counterId: counterId(zone.id, sensorType), timestamp: new Date(Date.now() - (2 + k * 3) * 60000).toISOString() };
    });
    const { Attributes } = await db.send(new UpdateCommand({
      TableName: tables.parkingZones, Key: { zoneId: zone.id },
      UpdateExpression: "SET sensorCount = :sensor, manualCount = :manual, sensorOnline = :online, lastReadingAt = :at, recentEvents = :events ADD version :one",
      ConditionExpression: "attribute_exists(zoneId)",
      ExpressionAttributeValues: { ":sensor": sensorCount, ":manual": manualCount, ":online": true, ":at": timestamp, ":events": recentEvents, ":one": 1 },
      ReturnValues: "ALL_NEW",
    }));
    return presentZone(Attributes);
  }));
}

export const handler = router({
  "GET /parking/zones": listParkingZones,
  "GET /parking/session": async (event) => ({ session: await getParkingSession(caller(event).userId) }),
  "POST /parking/entry": registerEntry,
  "POST /parking/exit": (event) => leaveParking(caller(event).userId),
  "GET /parking/presence": presence,
  "POST /parking/sensor-events": sensorEvent,
  "POST /parking/zones/{zoneId}/sensor": setSensorOnline,
  "POST /parking/demo/reset": resetDemo,
});
