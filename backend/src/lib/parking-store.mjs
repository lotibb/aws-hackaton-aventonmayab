import { randomUUID } from "node:crypto";
import { GetCommand, ScanCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { db, tables } from "./db.mjs";
import { HttpError } from "./http.mjs";

// Manual registrations and physical sensors are independent sources, never added together.
export function presentZone(zone, now = Date.now()) {
  const occupied = Number.isInteger(zone.registeredOccupied) && zone.registeredOccupied >= 0
    ? zone.registeredOccupied : null;
  const capacity = Number.isInteger(zone.capacity) && zone.capacity > 0 ? zone.capacity : null;
  return {
    ...zone,
    occupied,
    capacity,
    available: occupied === null || capacity === null ? null : Math.max(0, capacity - occupied),
    occupancyPercentage: occupied === null || capacity === null ? null : Math.round(occupied / capacity * 100),
    source: "registrado",
    sensorOnline: Boolean(zone.lastReadingAt) && now - Date.parse(zone.lastReadingAt) < 10 * 60 * 1000,
  };
}

export async function listParkingZones() {
  const zones = [];
  let cursor;
  do {
    const page = await db.send(new ScanCommand({
      TableName: tables.parkingZones, ConsistentRead: true, ExclusiveStartKey: cursor,
    }));
    zones.push(...(page.Items ?? []));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return zones.sort((a, b) => a.zoneId.localeCompare(b.zoneId, "es", { numeric: true })).map((z) => presentZone(z));
}

export async function getParkingSession(userId) {
  const { Item } = await db.send(new GetCommand({
    TableName: tables.parkingSessions, Key: { userId }, ConsistentRead: true,
  }));
  return Item ?? null;
}

function transactionConflict(error) {
  // A timeout or permissions error must not be reported as a business conflict.
  return error.name === "TransactionConflictException" ||
    (error.name === "TransactionCanceledException" && error.CancellationReasons?.some(
      (reason) => ["ConditionalCheckFailed", "TransactionConflict"].includes(reason.Code),
    ));
}

export async function enterParking(userId, zoneId) {
  const { Item: zone } = await db.send(new GetCommand({
    TableName: tables.parkingZones, Key: { zoneId }, ConsistentRead: true,
  }));
  if (!zone) throw new HttpError(404, "Zona no encontrada");
  if (presentZone(zone).occupied === null || presentZone(zone).capacity === null) {
    throw new HttpError(409, "La zona aún no tiene configurado el conteo y la capacidad.");
  }
  const session = {
    userId, zoneId, zoneName: zone.name, enteredAt: new Date().toISOString(),
    sessionId: randomUUID(), occupancyCounted: true,
  };
  try {
    await db.send(new TransactWriteCommand({ TransactItems: [
      { ConditionCheck: {
        TableName: tables.users, Key: { userId },
        ConditionExpression: "attribute_exists(userId) AND attribute_not_exists(deletingAt)",
      } },
      { Put: {
        TableName: tables.parkingSessions, Item: session,
        ConditionExpression: "attribute_not_exists(userId)",
      } },
      { Update: {
        TableName: tables.parkingZones, Key: { zoneId },
        UpdateExpression: "SET registeredOccupied = registeredOccupied + :one, updatedAt = :now",
        ConditionExpression: "attribute_exists(zoneId) AND registeredOccupied >= :zero AND registeredOccupied < #capacity",
        ExpressionAttributeNames: { "#capacity": "capacity" },
        ExpressionAttributeValues: { ":one": 1, ":zero": 0, ":now": session.enteredAt },
      } },
    ] }));
  } catch (error) {
    if (transactionConflict(error)) throw new HttpError(409, "Ya tienes una entrada activa, la zona está llena, tu perfil no está disponible o hubo un registro simultáneo. Actualiza e inténtalo de nuevo.");
    throw error;
  }
  return session;
}

// Shared by POST /parking/exit and DELETE /me. The session version prevents an
// old exit request from deleting a new entry, including when requests race.
export async function leaveParking(userId, { allowMissing = false } = {}) {
  const session = await getParkingSession(userId);
  if (!session) {
    if (allowMissing) return null;
    throw new HttpError(409, "No tienes una entrada activa");
  }
  const exitedAt = new Date().toISOString();
  const modern = typeof session.sessionId === "string";
  const deleteSession = {
    Delete: {
      TableName: tables.parkingSessions, Key: { userId },
      ConditionExpression: modern ? "sessionId = :version" : "attribute_not_exists(sessionId) AND enteredAt = :version",
      ExpressionAttributeValues: { ":version": modern ? session.sessionId : session.enteredAt },
    },
  };
  const items = [deleteSession];
  // Legacy sessions did not increment the new counter and must not decrement it.
  if (session.occupancyCounted === true) items.push({ Update: {
    TableName: tables.parkingZones, Key: { zoneId: session.zoneId },
    UpdateExpression: "SET registeredOccupied = registeredOccupied - :one, updatedAt = :now",
    ConditionExpression: "attribute_exists(zoneId) AND registeredOccupied >= :one",
    ExpressionAttributeValues: { ":one": 1, ":now": exitedAt },
  } });
  try {
    await db.send(new TransactWriteCommand({ TransactItems: items }));
  } catch (error) {
    if (transactionConflict(error)) {
      // Concurrent exit already closed the session; account deletion can proceed.
      if (allowMissing && !await getParkingSession(userId)) return null;
      throw new HttpError(409, "La sesión cambió o el contador requiere revisión. Actualiza e inténtalo de nuevo.");
    }
    throw error;
  }
  return {
    session, exitedAt,
    minutes: Math.max(0, Math.round((Date.parse(exitedAt) - Date.parse(session.enteredAt)) / 60000)),
  };
}
