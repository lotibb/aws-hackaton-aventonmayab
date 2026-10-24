import { randomUUID } from "node:crypto";
import {
  BatchGetCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { db, displayName, tables } from "./lib/db.mjs";
import { HttpError, caller, isConditionFailed, readBody, router } from "./lib/http.mjs";

// Trip status flow: Disponible -> En curso -> Finalizado, or Cancelado.
const ACTIVE = ["Disponible", "En curso"];
const ALLOWED_FROM = {
  "En curso": ["Disponible"],
  Finalizado: ["En curso"],
  Cancelado: ["Disponible", "En curso"],
};

function toIso(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new HttpError(400, "Fecha inválida");
  }
  return date.toISOString();
}

// The meeting point is only for the driver, or an accepted passenger while the trip is active.
function visibleTrip(trip, userId, request) {
  const canSee =
    trip.driverId === userId ||
    (request?.status === "accepted" && ACTIVE.includes(trip.status));
  if (canSee) return trip;
  const { meetingPoint, ...rest } = trip;
  return rest;
}

async function loadTrip(tripId) {
  const { Item } = await db.send(
    new GetCommand({ TableName: tables.trips, Key: { tripId } }),
  );
  if (!Item) throw new HttpError(404, "Viaje no encontrado");
  return Item;
}

async function loadOwnTrip(tripId, me) {
  const trip = await loadTrip(tripId);
  if (trip.driverId !== me.userId) {
    throw new HttpError(403, "Solo el conductor puede hacer esto");
  }
  return trip;
}

async function loadRequest(tripId, passengerId) {
  const { Item } = await db.send(
    new GetCommand({ TableName: tables.seatRequests, Key: { tripId, passengerId } }),
  );
  return Item;
}

// Changes a seat request's status only if it is still `from`.
function requestStatusUpdate(tripId, passengerId, from, to) {
  return {
    TableName: tables.seatRequests,
    Key: { tripId, passengerId },
    UpdateExpression: "SET #s = :to, updatedAt = :now",
    ConditionExpression: "#s = :from",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: {
      ":from": from,
      ":to": to,
      ":now": new Date().toISOString(),
    },
  };
}

// GET /trips?colonia=&from=  Open trips with free seats, by departure time.
async function listTrips(event) {
  const { colonia, from } = event.queryStringParameters ?? {};
  const since = from ? toIso(from) : new Date().toISOString();
  const values = { ":since": since };
  const { Items } = colonia
    ? await db.send(
        new QueryCommand({
          TableName: tables.trips,
          IndexName: "byColonia",
          KeyConditionExpression: "colonia = :c AND departureTime >= :since",
          ExpressionAttributeValues: { ...values, ":c": colonia },
        }),
      )
    : await db.send(
        new ScanCommand({
          TableName: tables.trips,
          FilterExpression: "departureTime >= :since",
          ExpressionAttributeValues: values,
        }),
      );
  return Items.filter((t) => t.status === "Disponible" && t.seatsLeft > 0)
    .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
    .map(({ meetingPoint, ...trip }) => trip);
}

// POST /trips  { colonia, departureTime, seatsTotal, meetingPoint }
async function createTrip(event) {
  const me = caller(event);
  const { colonia, departureTime, seatsTotal, meetingPoint } = readBody(event);
  if (typeof colonia !== "string" || !colonia.trim()) {
    throw new HttpError(400, "Falta la colonia");
  }
  if (typeof meetingPoint !== "string" || !meetingPoint.trim()) {
    throw new HttpError(400, "Falta el punto de encuentro");
  }
  const seats = Number(seatsTotal);
  if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
    throw new HttpError(400, "Los asientos deben ser de 1 a 8");
  }
  const trip = {
    tripId: randomUUID(),
    driverId: me.userId,
    driverName: await displayName(me),
    colonia: colonia.trim(),
    departureTime: toIso(departureTime),
    seatsTotal: seats,
    seatsLeft: seats,
    meetingPoint: meetingPoint.trim(),
    status: "Disponible",
    createdAt: new Date().toISOString(),
  };
  await db.send(new PutCommand({ TableName: tables.trips, Item: trip }));
  return trip;
}

// GET /trips/{tripId}  The driver also gets the list of requests.
async function getTrip(event) {
  const me = caller(event);
  const trip = await loadTrip(event.pathParameters.tripId);
  if (trip.driverId === me.userId) {
    const { Items } = await db.send(
      new QueryCommand({
        TableName: tables.seatRequests,
        KeyConditionExpression: "tripId = :t",
        ExpressionAttributeValues: { ":t": trip.tripId },
      }),
    );
    return { ...trip, requests: Items };
  }
  const myRequest = await loadRequest(trip.tripId, me.userId);
  return { ...visibleTrip(trip, me.userId, myRequest), myRequest: myRequest ?? null };
}

// GET /me/trips  Trips I drive and trips I asked to join.
async function myTrips(event) {
  const me = caller(event);
  const [{ Items: driving }, { Items: requests }] = await Promise.all([
    db.send(
      new QueryCommand({
        TableName: tables.trips,
        IndexName: "byDriver",
        KeyConditionExpression: "driverId = :me",
        ExpressionAttributeValues: { ":me": me.userId },
      }),
    ),
    db.send(
      new QueryCommand({
        TableName: tables.seatRequests,
        IndexName: "byPassenger",
        KeyConditionExpression: "passengerId = :me",
        ExpressionAttributeValues: { ":me": me.userId },
      }),
    ),
  ]);
  let trips = [];
  if (requests.length) {
    const { Responses } = await db.send(
      new BatchGetCommand({
        RequestItems: {
          [tables.trips]: { Keys: requests.map((r) => ({ tripId: r.tripId })) },
        },
      }),
    );
    trips = Responses[tables.trips];
  }
  const tripsById = Object.fromEntries(trips.map((t) => [t.tripId, t]));
  return {
    asDriver: driving,
    asPassenger: requests
      .filter((r) => tripsById[r.tripId])
      .map((r) => ({ ...visibleTrip(tripsById[r.tripId], me.userId, r), myRequest: r })),
  };
}

// POST /trips/{tripId}/requests  Ask for a seat.
async function requestSeat(event) {
  const me = caller(event);
  const trip = await loadTrip(event.pathParameters.tripId);
  if (trip.driverId === me.userId) {
    throw new HttpError(400, "No puedes pedir lugar en tu propio viaje");
  }
  if (trip.status !== "Disponible" || trip.seatsLeft < 1) {
    throw new HttpError(409, "Este viaje ya no tiene lugares");
  }
  const request = {
    tripId: trip.tripId,
    passengerId: me.userId,
    passengerName: await displayName(me),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  try {
    // Only one request per passenger per trip; asking again is allowed after cancelling.
    await db.send(
      new PutCommand({
        TableName: tables.seatRequests,
        Item: request,
        ConditionExpression: "attribute_not_exists(passengerId) OR #s = :cancelled",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":cancelled": "cancelled" },
      }),
    );
  } catch (err) {
    if (isConditionFailed(err)) {
      throw new HttpError(409, "Ya pediste lugar en este viaje");
    }
    throw err;
  }
  return request;
}

// DELETE /trips/{tripId}/requests  The passenger cancels their own request.
async function cancelRequest(event) {
  const me = caller(event);
  const { tripId } = event.pathParameters;
  const request = await loadRequest(tripId, me.userId);
  try {
    if (request?.status === "pending") {
      await db.send(
        new UpdateCommand(requestStatusUpdate(tripId, me.userId, "pending", "cancelled")),
      );
    } else if (request?.status === "accepted") {
      // Give the seat back in the same transaction.
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            { Update: requestStatusUpdate(tripId, me.userId, "accepted", "cancelled") },
            {
              Update: {
                TableName: tables.trips,
                Key: { tripId },
                UpdateExpression: "SET seatsLeft = seatsLeft + :one",
                ConditionExpression: "seatsLeft < seatsTotal",
                ExpressionAttributeValues: { ":one": 1 },
              },
            },
          ],
        }),
      );
    } else {
      throw new HttpError(404, "No tienes una solicitud activa en este viaje");
    }
  } catch (err) {
    if (isConditionFailed(err) || err.name === "TransactionCanceledException") {
      throw new HttpError(409, "La solicitud cambió, intenta de nuevo");
    }
    throw err;
  }
  return { ...request, status: "cancelled" };
}

// POST /trips/{tripId}/requests/{passengerId}/accept
// One transaction: take a seat only if one is left, accept only if still pending.
// If two acceptances race for the last seat, DynamoDB lets only one succeed.
async function acceptRequest(event) {
  const me = caller(event);
  const { tripId, passengerId } = event.pathParameters;
  await loadOwnTrip(tripId, me);
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: tables.trips,
              Key: { tripId },
              UpdateExpression: "SET seatsLeft = seatsLeft - :one",
              ConditionExpression: "seatsLeft > :zero AND #s = :open",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: { ":one": 1, ":zero": 0, ":open": "Disponible" },
            },
          },
          { Update: requestStatusUpdate(tripId, passengerId, "pending", "accepted") },
        ],
      }),
    );
  } catch (err) {
    if (err.name !== "TransactionCanceledException") throw err;
    const [tripCheck, requestCheck] = err.CancellationReasons ?? [];
    if (requestCheck?.Code === "ConditionalCheckFailed") {
      throw new HttpError(409, "La solicitud ya no está pendiente");
    }
    if (tripCheck?.Code === "ConditionalCheckFailed") {
      throw new HttpError(409, "Ya no quedan lugares en este viaje");
    }
    throw new HttpError(409, "Otra operación ocurrió al mismo tiempo, intenta de nuevo");
  }
  return { tripId, passengerId, status: "accepted" };
}

// POST /trips/{tripId}/requests/{passengerId}/reject
async function rejectRequest(event) {
  const me = caller(event);
  const { tripId, passengerId } = event.pathParameters;
  await loadOwnTrip(tripId, me);
  try {
    await db.send(
      new UpdateCommand(requestStatusUpdate(tripId, passengerId, "pending", "rejected")),
    );
  } catch (err) {
    if (isConditionFailed(err)) {
      throw new HttpError(409, "La solicitud ya no está pendiente");
    }
    throw err;
  }
  return { tripId, passengerId, status: "rejected" };
}

// POST /trips/{tripId}/status  { status: "En curso" | "Finalizado" | "Cancelado" }
async function setTripStatus(event) {
  const me = caller(event);
  const { status } = readBody(event);
  if (!ALLOWED_FROM[status]) throw new HttpError(400, "Estado inválido");
  const trip = await loadOwnTrip(event.pathParameters.tripId, me);
  if (!ALLOWED_FROM[status].includes(trip.status)) {
    throw new HttpError(409, `No se puede pasar de ${trip.status} a ${status}`);
  }
  try {
    await db.send(
      new UpdateCommand({
        TableName: tables.trips,
        Key: { tripId: trip.tripId },
        UpdateExpression: "SET #s = :to",
        ConditionExpression: "#s = :from",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":from": trip.status, ":to": status },
      }),
    );
  } catch (err) {
    if (isConditionFailed(err)) {
      throw new HttpError(409, "El viaje cambió, intenta de nuevo");
    }
    throw err;
  }
  return { ...trip, status };
}

export const handler = router({
  "GET /trips": listTrips,
  "POST /trips": createTrip,
  "GET /trips/{tripId}": getTrip,
  "GET /me/trips": myTrips,
  "POST /trips/{tripId}/requests": requestSeat,
  "DELETE /trips/{tripId}/requests": cancelRequest,
  "POST /trips/{tripId}/requests/{passengerId}/accept": acceptRequest,
  "POST /trips/{tripId}/requests/{passengerId}/reject": rejectRequest,
  "POST /trips/{tripId}/status": setTripStatus,
});
