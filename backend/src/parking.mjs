import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { db, tables } from "./lib/db.mjs";
import { HttpError, caller, isConditionFailed, readBody, router } from "./lib/http.mjs";

// The campus zones. Same ids, names and capacities as frontend/lib/config.ts.
// `demo` is the state "Restablecer datos de demo" goes back to (frontend/lib/mock/seed.ts).
const ZONES = [
  { zoneId: "P1", name: "Canchas y Salud I - Trasera", area: "Canchas y Salud I", capacity: 80, demo: { sensorCount: 35, manualCount: 31 } },
  { zoneId: "P2", name: "Central y LIIET - Trasera", area: "Central y LIIET", capacity: 85, demo: { sensorCount: 53, manualCount: 50 } },
  { zoneId: "P3", name: "tecniA", area: "Parque Tecnológico y de Innovación", capacity: 65, demo: { sensorCount: 28, manualCount: 31 } },
  { zoneId: "P4", name: "Salud - Posterior", area: "Edificios de Salud", capacity: 40, demo: { sensorCount: 34, manualCount: 26 } },
  { zoneId: "P5", name: "Central - Jardines", area: "Estacionamiento central, junto a la glorieta", capacity: 95, demo: { sensorCount: 70, manualCount: 68 } },
  { zoneId: "P6", name: "Le Cordon Bleu", area: "Hacienda Mayab", capacity: 35, demo: { sensorCount: 18, manualCount: 17 } },
  { zoneId: "P7", name: "Rectoría", area: "Frente a Rectoría y LABICAM", capacity: 65, demo: { sensorCount: 48, manualCount: 46 } },
  { zoneId: "P8", name: "Edificio 5 - Trasera", area: "Arquitectura, Diseño, Comunicación e Ingeniería", capacity: 35, demo: { sensorCount: 22, manualCount: 20 } },
  { zoneId: "P9", name: "Subway - Central", area: "Junto a Subway y el edificio Central", capacity: 35, demo: { sensorCount: 30, manualCount: 29 } },
  { zoneId: "P10", name: "Edificio 5 - Lateral", area: "Entre Edificio 5 y LABICAM", capacity: 25, demo: { sensorCount: 14, manualCount: 13 } },
];
const RECENT_EVENTS = 10;
const SENSOR_TYPES = ["entrada", "salida"];

const counterId = (zoneId, sensorType) => `cnt-${zoneId}-${sensorType === "entrada" ? "in" : "out"}`;

function initialZone({ demo, ...zone }) {
  const now = Date.now();
  // A few past readings so the simulator's "Eventos recientes" isn't empty.
  const recentEvents = Array.from({ length: 6 }, (_, k) => {
    const sensorType = k % 4 === 3 ? "salida" : "entrada";
    return {
      id: `se-${zone.zoneId}-${now}-${k}`,
      sensorType,
      counterId: counterId(zone.zoneId, sensorType),
      timestamp: new Date(now - (2 + k * 3) * 60000).toISOString(),
    };
  });
  return {
    ...zone,
    ...demo,
    sensorOnline: true,
    lastReadingAt: recentEvents[0].timestamp,
    recentEvents,
    version: 0,
  };
}

async function loadZone(zoneId) {
  const { Item } = await db.send(
    new GetCommand({ TableName: tables.parkingZones, Key: { zoneId }, ConsistentRead: true }),
  );
  if (!Item) throw new HttpError(404, "Zona no encontrada");
  return Item;
}

// Only aggregate numbers leave this Lambda: never who is parked where.
function presentZone(zone) {
  return {
    zoneId: zone.zoneId,
    name: zone.name,
    area: zone.area,
    capacity: zone.capacity,
    sensorCount: zone.sensorCount ?? 0,
    manualCount: zone.manualCount ?? 0,
    sensorOnline: zone.sensorOnline === true,
    lastReadingAt: zone.lastReadingAt ?? null,
    recentEvents: zone.recentEvents ?? [],
  };
}

// GET /parking/zones  Creates any missing campus zone, so no seed step is needed.
async function listZones() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new ScanCommand({ TableName: tables.parkingZones, ExclusiveStartKey }));
    items.push(...page.Items);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  for (const zone of ZONES.filter((z) => !items.some((i) => i.zoneId === z.zoneId))) {
    const item = initialZone(zone);
    try {
      await db.send(
        new PutCommand({
          TableName: tables.parkingZones,
          Item: item,
          ConditionExpression: "attribute_not_exists(zoneId)",
        }),
      );
      items.push(item);
    } catch (err) {
      if (!isConditionFailed(err)) throw err;
      items.push(await loadZone(zone.zoneId));
    }
  }
  // P1, P2 … P10 in number order.
  return items
    .sort((a, b) => a.zoneId.localeCompare(b.zoneId, "es", { numeric: true }))
    .map(presentZone);
}

// GET /parking/session  The caller's active entry, or null.
async function mySession(event) {
  const { userId } = caller(event);
  const { Item } = await db.send(
    new GetCommand({ TableName: tables.parkingSessions, Key: { userId }, ConsistentRead: true }),
  );
  return { session: Item ?? null };
}

const changeManualCount = (zoneId, delta) =>
  delta > 0
    ? {
        TableName: tables.parkingZones,
        Key: { zoneId },
        UpdateExpression: "SET manualCount = if_not_exists(manualCount, :zero) + :delta",
        // `capacity` is a DynamoDB reserved word.
        ConditionExpression:
          "attribute_exists(zoneId) AND (attribute_not_exists(manualCount) OR manualCount < #cap)",
        ExpressionAttributeNames: { "#cap": "capacity" },
        ExpressionAttributeValues: { ":zero": 0, ":delta": delta },
      }
    : {
        TableName: tables.parkingZones,
        Key: { zoneId },
        UpdateExpression: "SET manualCount = manualCount + :delta",
        ConditionExpression: "manualCount > :zero",
        ExpressionAttributeValues: { ":zero": 0, ":delta": delta },
      };

// POST /parking/entry  { zoneId }
// The session and the zone's estimate change together. A double tap can't create two entries.
async function registerEntry(event) {
  const { userId } = caller(event);
  const { zoneId } = readBody(event);
  if (typeof zoneId !== "string" || !zoneId) throw new HttpError(400, "Falta la zona");
  const zone = await loadZone(zoneId);
  const session = { userId, zoneId, zoneName: zone.name, enteredAt: new Date().toISOString() };
  const putSession = {
    TableName: tables.parkingSessions,
    Item: session,
    ConditionExpression: "attribute_not_exists(userId)",
  };
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [{ Put: putSession }, { Update: changeManualCount(zoneId, 1) }],
      }),
    );
  } catch (err) {
    if (err.name !== "TransactionCanceledException") throw err;
    const [sessionCheck] = err.CancellationReasons ?? [];
    if (sessionCheck?.Code === "ConditionalCheckFailed") {
      throw new HttpError(409, "Ya tienes una entrada activa. Registra tu salida primero.");
    }
    // The estimate is already at capacity: keep the entry, the count stays at the top.
    try {
      await db.send(new PutCommand(putSession));
    } catch (e) {
      if (isConditionFailed(e)) throw new HttpError(409, "Ya tienes una entrada activa. Registra tu salida primero.");
      throw e;
    }
  }
  return { session };
}

// POST /parking/exit
async function registerExit(event) {
  const { userId } = caller(event);
  const { Item: session } = await db.send(
    new GetCommand({ TableName: tables.parkingSessions, Key: { userId }, ConsistentRead: true }),
  );
  if (!session) throw new HttpError(409, "No tienes una entrada activa");
  const deleteSession = {
    TableName: tables.parkingSessions,
    Key: { userId },
    ConditionExpression: "enteredAt = :at",
    ExpressionAttributeValues: { ":at": session.enteredAt },
  };
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [{ Delete: deleteSession }, { Update: changeManualCount(session.zoneId, -1) }],
      }),
    );
  } catch (err) {
    if (err.name !== "TransactionCanceledException") throw err;
    const [sessionCheck] = err.CancellationReasons ?? [];
    if (sessionCheck?.Code === "ConditionalCheckFailed") {
      throw new HttpError(409, "Tu entrada cambió, actualiza e intenta de nuevo");
    }
    // The estimate was already 0 (e.g. after a demo reset): still let the student leave.
    try {
      await db.send(new DeleteCommand(deleteSession));
    } catch (e) {
      if (isConditionFailed(e)) throw new HttpError(409, "Tu entrada cambió, actualiza e intenta de nuevo");
      throw e;
    }
  }
  const exitedAt = new Date().toISOString();
  return {
    session,
    exitedAt,
    minutes: Math.round((Date.parse(exitedAt) - Date.parse(session.enteredAt)) / 60000),
  };
}

// GET /parking/presence  How many students have class at each time, for the forecasts.
// Only counts per weekday and 10-minute slot; individual schedules never leave this Lambda.
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
    const page = await db.send(
      new ScanCommand({
        TableName: tables.schedules,
        ProjectionExpression: "#d, #s, #e",
        ExpressionAttributeNames: { "#d": "day", "#s": "start", "#e": "end" },
        ExclusiveStartKey,
      }),
    );
    slots.push(...page.Items);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const byWeekday = {};
  let max = 1;
  for (let weekday = 0; weekday < 7; weekday++) {
    // Stored days go 1 (lunes) to 7 (domingo); the app counts 0 (domingo) to 6.
    const day = slots.filter((s) => s.day % 7 === weekday);
    const counts = [];
    for (let m = DAY_START; m <= DAY_END; m += SLOT) {
      const count = day.filter(
        (s) => toMinutes(s.start) - ARRIVAL_LEAD <= m && m < toMinutes(s.end) + DEPARTURE_LAG,
      ).length;
      counts.push(count);
      max = Math.max(max, count);
    }
    byWeekday[weekday] = counts;
  }
  const data = { byWeekday, max };
  presenceCache = { at: Date.now(), data };
  return data;
}

// Writes a zone's sensor state only if nobody changed it since it was read.
async function updateZoneVersioned(zoneId, change) {
  for (let attempt = 0; attempt < 8; attempt++) {
    // Readings that arrive together retry after a short random wait.
    if (attempt) await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * attempt));
    const zone = await loadZone(zoneId);
    const next = change(zone);
    if (!next) return presentZone(zone);
    const version = zone.version ?? 0;
    try {
      await db.send(
        new UpdateCommand({
          TableName: tables.parkingZones,
          Key: { zoneId },
          UpdateExpression:
            "SET sensorCount = :count, lastReadingAt = :at, recentEvents = :events, version = :next",
          ConditionExpression: "attribute_not_exists(version) OR version = :version",
          ExpressionAttributeValues: {
            ":count": next.sensorCount,
            ":at": next.lastReadingAt,
            ":events": next.recentEvents,
            ":version": version,
            ":next": version + 1,
          },
        }),
      );
      return presentZone({ ...zone, ...next });
    } catch (err) {
      if (!isConditionFailed(err)) throw err;
    }
  }
  throw new HttpError(409, "Llegaron varias lecturas al mismo tiempo, intenta de nuevo");
}

// POST /parking/sensor-events  { zoneId, sensorType: "entrada" | "salida" }
// What an entrance or exit counter sends. Today the simulator in Perfil calls it.
async function sensorEvent(event) {
  caller(event);
  const { zoneId, sensorType } = readBody(event);
  if (typeof zoneId !== "string" || !zoneId) throw new HttpError(400, "Falta la zona");
  if (!SENSOR_TYPES.includes(sensorType)) throw new HttpError(400, "sensorType debe ser entrada o salida");
  return updateZoneVersioned(zoneId, (zone) => {
    if (zone.sensorOnline !== true) {
      throw new HttpError(409, "Los sensores de esta zona están fuera de línea.");
    }
    const count = zone.sensorCount ?? 0;
    // A real exit can't happen from an empty lot, nor an entry into a full one.
    if (sensorType === "salida" && count <= 0) return null;
    if (sensorType === "entrada" && count >= zone.capacity) return null;
    const timestamp = new Date().toISOString();
    const reading = {
      id: `se-${zoneId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sensorType,
      counterId: counterId(zoneId, sensorType),
      timestamp,
    };
    return {
      sensorCount: count + (sensorType === "entrada" ? 1 : -1),
      lastReadingAt: timestamp,
      recentEvents: [reading, ...(zone.recentEvents ?? [])].slice(0, RECENT_EVENTS),
    };
  });
}

// POST /parking/zones/{zoneId}/sensor  { online: boolean }  Turns a zone's sensors on or off (simulator).
async function setSensorOnline(event) {
  caller(event);
  const { online } = readBody(event);
  if (typeof online !== "boolean") throw new HttpError(400, "online debe ser true o false");
  try {
    const { Attributes } = await db.send(
      new UpdateCommand({
        TableName: tables.parkingZones,
        Key: { zoneId: event.pathParameters.zoneId },
        UpdateExpression: "SET sensorOnline = :online",
        ConditionExpression: "attribute_exists(zoneId)",
        ExpressionAttributeValues: { ":online": online },
        ReturnValues: "ALL_NEW",
      }),
    );
    return presentZone(Attributes);
  } catch (err) {
    if (isConditionFailed(err)) throw new HttpError(404, "Zona no encontrada");
    throw err;
  }
}

// POST /parking/demo/reset  Puts the campus zones back to the demo state. Active entries stay.
async function resetDemo(event) {
  caller(event);
  const zones = ZONES.map(initialZone);
  await Promise.all(
    zones.map((Item) => db.send(new PutCommand({ TableName: tables.parkingZones, Item }))),
  );
  return zones.map(presentZone);
}

export const handler = router({
  "GET /parking/zones": listZones,
  "GET /parking/session": mySession,
  "POST /parking/entry": registerEntry,
  "POST /parking/exit": registerExit,
  "GET /parking/presence": presence,
  "POST /parking/sensor-events": sensorEvent,
  "POST /parking/zones/{zoneId}/sensor": setSensorOnline,
  "POST /parking/demo/reset": resetDemo,
});
