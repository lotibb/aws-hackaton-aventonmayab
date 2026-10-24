import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { db, tables } from "./lib/db.mjs";
import { HttpError, caller, isConditionFailed, readBody, router } from "./lib/http.mjs";

// A zone's sensor counts as offline when no reading arrived in this long.
const OFFLINE_AFTER_MS = 10 * 60 * 1000;

// GET /parking/zones
async function listZones() {
  const { Items } = await db.send(new ScanCommand({ TableName: tables.parkingZones }));
  const now = Date.now();
  return Items.sort((a, b) => a.zoneId.localeCompare(b.zoneId)).map((zone) => ({
    ...zone,
    sensorOnline:
      Boolean(zone.lastReadingAt) &&
      now - Date.parse(zone.lastReadingAt) < OFFLINE_AFTER_MS,
  }));
}

// GET /parking/session  The caller's active entry, or null.
async function mySession(event) {
  const { userId } = caller(event);
  const { Item } = await db.send(
    new GetCommand({ TableName: tables.parkingSessions, Key: { userId } }),
  );
  return { session: Item ?? null };
}

// POST /parking/entry  { zoneId }
// The write only succeeds if the student has no active entry, so a double tap can't create two.
async function registerEntry(event) {
  const { userId } = caller(event);
  const { zoneId } = readBody(event);
  if (typeof zoneId !== "string" || !zoneId) throw new HttpError(400, "Falta la zona");
  const { Item: zone } = await db.send(
    new GetCommand({ TableName: tables.parkingZones, Key: { zoneId } }),
  );
  if (!zone) throw new HttpError(404, "Zona no encontrada");
  const session = {
    userId,
    zoneId,
    zoneName: zone.name,
    enteredAt: new Date().toISOString(),
  };
  try {
    await db.send(
      new PutCommand({
        TableName: tables.parkingSessions,
        Item: session,
        ConditionExpression: "attribute_not_exists(userId)",
      }),
    );
  } catch (err) {
    if (isConditionFailed(err)) {
      throw new HttpError(409, "Ya tienes una entrada activa. Registra tu salida primero.");
    }
    throw err;
  }
  return { session };
}

// POST /parking/exit
async function registerExit(event) {
  const { userId } = caller(event);
  let session;
  try {
    ({ Attributes: session } = await db.send(
      new DeleteCommand({
        TableName: tables.parkingSessions,
        Key: { userId },
        ConditionExpression: "attribute_exists(userId)",
        ReturnValues: "ALL_OLD",
      }),
    ));
  } catch (err) {
    if (isConditionFailed(err)) throw new HttpError(409, "No tienes una entrada activa");
    throw err;
  }
  const exitedAt = new Date().toISOString();
  return {
    session,
    exitedAt,
    minutes: Math.round((Date.parse(exitedAt) - Date.parse(session.enteredAt)) / 60000),
  };
}

export const handler = router({
  "GET /parking/zones": listZones,
  "GET /parking/session": mySession,
  "POST /parking/entry": registerEntry,
  "POST /parking/exit": registerExit,
});
