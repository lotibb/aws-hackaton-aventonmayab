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
import { db, tables } from "./lib/db.mjs";
import { HttpError, caller, isConditionFailed, readBody, router } from "./lib/http.mjs";

// Trip status flow: Disponible -> Finalizado, or Cancelado.
// "En curso" remains readable for trips created by older app versions.
const ACTIVE = ["Disponible", "En curso"];
const ALLOWED_FROM = {
  Finalizado: ["Disponible", "En curso"],
  Cancelado: ["Disponible", "En curso"],
};

function toIso(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new HttpError(400, "Fecha inválida");
  }
  return date.toISOString();
}

function optionalText(value, field, max) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new HttpError(400, `${field} inválido`);
  }
  return value.trim();
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

// Profiles are read at request time so name, colonia and photo are always current.
async function loadProfiles(userIds) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return {};
  const { Responses } = await db.send(
    new BatchGetCommand({
      RequestItems: {
        [tables.users]: {
          Keys: ids.map((userId) => ({ userId })),
          ProjectionExpression: "userId, #n, colonia, photoUrl, phone",
          ExpressionAttributeNames: { "#n": "name" },
        },
      },
    }),
  );
  return Object.fromEntries(Responses[tables.users].map((p) => [p.userId, p]));
}

// The phone number is shared only between a driver and a passenger the driver accepted,
// and only while the trip is active.
const shareContact = (trip, request) =>
  request?.status === "accepted" && ACTIVE.includes(trip.status);

// What other students may see. Before a match (request sent or accepted) only the first name.
// null means the account was deleted.
function publicProfile(profiles, userId, fullName, withPhone = false) {
  const profile = profiles[userId];
  if (!profile) return null;
  const name = profile.name || "Estudiante";
  return {
    id: userId,
    name: fullName ? name : name.split(" ")[0],
    colonia: profile.colonia,
    photoUrl: profile.photoUrl,
    phone: withPhone ? profile.phone : undefined,
  };
}

function presentTrip(trip, userId, request, profiles) {
  const matched =
    trip.driverId === userId || ["pending", "accepted"].includes(request?.status);
  return {
    ...visibleTrip(trip, userId, request),
    driver: publicProfile(profiles, trip.driverId, matched, shareContact(trip, request)),
    myRequest: request ?? null,
  };
}

// The driver sees who asked for a seat, with their full name.
function presentRequests(trip, requests, profiles) {
  return requests.map((r) => ({
    ...r,
    passenger: publicProfile(profiles, r.passengerId, true, shareContact(trip, r)),
  }));
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

async function tripRequests(tripId) {
  const { Items } = await db.send(
    new QueryCommand({
      TableName: tables.seatRequests,
      KeyConditionExpression: "tripId = :t",
      ExpressionAttributeValues: { ":t": tripId },
    }),
  );
  return Items;
}

async function passengerRequests(passengerId) {
  const { Items } = await db.send(
    new QueryCommand({
      TableName: tables.seatRequests,
      IndexName: "byPassenger",
      KeyConditionExpression: "passengerId = :me",
      ExpressionAttributeValues: { ":me": passengerId },
    }),
  );
  return Items;
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

// GET /trips?colonia=&from=  Other drivers' open trips with free seats, by departure time.
async function listTrips(event) {
  const me = caller(event);
  const { colonia, from } = event.queryStringParameters ?? {};
  const since = from ? toIso(from) : new Date().toISOString();
  const values = { ":since": since };
  const [{ Items }, myRequests] = await Promise.all([
    colonia
      ? db.send(
          new QueryCommand({
            TableName: tables.trips,
            IndexName: "byColonia",
            KeyConditionExpression: "colonia = :c AND departureTime >= :since",
            ExpressionAttributeValues: { ...values, ":c": colonia },
          }),
        )
      : db.send(
          new ScanCommand({
            TableName: tables.trips,
            FilterExpression: "departureTime >= :since",
            ExpressionAttributeValues: values,
          }),
        ),
    passengerRequests(me.userId),
  ]);
  const requestsByTrip = Object.fromEntries(myRequests.map((r) => [r.tripId, r]));
  const open = Items.filter(
    (t) => t.status === "Disponible" && t.seatsLeft > 0 && t.driverId !== me.userId,
  ).sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  const profiles = await loadProfiles(open.map((t) => t.driverId));
  return open.map((t) => presentTrip(t, me.userId, requestsByTrip[t.tripId], profiles));
}

// POST /trips  { colonia, destination, departureTime, seatsTotal, meetingPoint?, routeDescription? }
async function createTrip(event) {
  const me = caller(event);
  const body = readBody(event);
  const { colonia, departureTime, seatsTotal, meetingPoint } = body;
  const origin = optionalText(colonia, "Origen", 80);
  if (!origin) throw new HttpError(400, "Falta el lugar de salida");
  const publicMeetingPoint = optionalText(meetingPoint, "Punto de encuentro", 120);
  const seats = Number(seatsTotal);
  if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
    throw new HttpError(400, "Los asientos deben ser de 1 a 8");
  }
  const trip = {
    tripId: randomUUID(),
    driverId: me.userId,
    colonia: origin,
    destination: optionalText(body.destination, "Destino", 80),
    routeDescription: optionalText(body.routeDescription, "Ruta", 140),
    departureTime: toIso(departureTime),
    seatsTotal: seats,
    seatsLeft: seats,
    ...(publicMeetingPoint ? { meetingPoint: publicMeetingPoint } : {}),
    status: "Disponible",
    createdAt: new Date().toISOString(),
  };
  await db.send(new PutCommand({ TableName: tables.trips, Item: trip }));
  const profiles = await loadProfiles([me.userId]);
  return { ...presentTrip(trip, me.userId, undefined, profiles), requests: [] };
}

// PUT /trips/{tripId}/meeting-point  { meetingPoint }
async function setMeetingPoint(event) {
  const me = caller(event);
  const trip = await loadOwnTrip(event.pathParameters.tripId, me);
  if (!ACTIVE.includes(trip.status)) {
    throw new HttpError(409, "El viaje ya no acepta cambios al punto de encuentro");
  }
  const meetingPoint = optionalText(readBody(event).meetingPoint, "Punto de encuentro", 120);
  if (!meetingPoint || meetingPoint.length < 3) {
    throw new HttpError(400, "Escribe un punto de encuentro público");
  }
  try {
    await db.send(
      new UpdateCommand({
        TableName: tables.trips,
        Key: { tripId: trip.tripId },
        UpdateExpression: "SET meetingPoint = :point",
        ConditionExpression: "#s = :available OR #s = :inProgress",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":point": meetingPoint,
          ":available": "Disponible",
          ":inProgress": "En curso",
        },
      }),
    );
  } catch (err) {
    if (isConditionFailed(err)) {
      throw new HttpError(409, "El viaje ya no acepta cambios al punto de encuentro");
    }
    throw err;
  }
  return { tripId: trip.tripId, meetingPoint };
}

// GET /trips/{tripId}  The driver also gets the list of requests.
async function getTrip(event) {
  const me = caller(event);
  const trip = await loadTrip(event.pathParameters.tripId);
  if (trip.driverId === me.userId) {
    const requests = await tripRequests(trip.tripId);
    const profiles = await loadProfiles([trip.driverId, ...requests.map((r) => r.passengerId)]);
    return {
      ...presentTrip(trip, me.userId, undefined, profiles),
      requests: presentRequests(trip, requests, profiles),
    };
  }
  const myRequest = await loadRequest(trip.tripId, me.userId);
  // Students who never asked for a seat only see trips still open for requests.
  if (!myRequest && trip.status !== "Disponible") {
    throw new HttpError(404, "Viaje no encontrado");
  }
  const profiles = await loadProfiles([trip.driverId]);
  return presentTrip(trip, me.userId, myRequest, profiles);
}

// GET /me/trips  Trips I drive (with their requests) and trips I asked to join.
async function myTrips(event) {
  const me = caller(event);
  const [{ Items: driving }, requests] = await Promise.all([
    db.send(
      new QueryCommand({
        TableName: tables.trips,
        IndexName: "byDriver",
        KeyConditionExpression: "driverId = :me",
        ExpressionAttributeValues: { ":me": me.userId },
      }),
    ),
    passengerRequests(me.userId),
  ]);
  const [drivingRequests, trips] = await Promise.all([
    Promise.all(driving.map((t) => tripRequests(t.tripId))),
    requests.length
      ? db
          .send(
            new BatchGetCommand({
              RequestItems: {
                [tables.trips]: { Keys: requests.map((r) => ({ tripId: r.tripId })) },
              },
            }),
          )
          .then((r) => r.Responses[tables.trips])
      : [],
  ]);
  const tripsById = Object.fromEntries(trips.map((t) => [t.tripId, t]));
  const profiles = await loadProfiles([
    me.userId,
    ...drivingRequests.flat().map((r) => r.passengerId),
    ...trips.map((t) => t.driverId),
  ]);
  return {
    asDriver: driving.map((t, i) => ({
      ...presentTrip(t, me.userId, undefined, profiles),
      requests: presentRequests(t, drivingRequests[i], profiles),
    })),
    asPassenger: requests
      .filter((r) => tripsById[r.tripId])
      .map((r) => presentTrip(tripsById[r.tripId], me.userId, r, profiles)),
  };
}

// POST /trips/{tripId}/requests  { consent: true }  Ask for a seat.
// The driver only sees the passenger's name, photo and colonia, and only after this consent.
async function requestSeat(event) {
  const me = caller(event);
  if (readBody(event).consent !== true) {
    throw new HttpError(400, "Necesitamos tu consentimiento para enviar la solicitud");
  }
  const trip = await loadTrip(event.pathParameters.tripId);
  if (trip.driverId === me.userId) {
    throw new HttpError(400, "No puedes pedir lugar en tu propio viaje");
  }
  if (trip.status !== "Disponible" || trip.seatsLeft < 1) {
    throw new HttpError(409, "Este viaje ya no tiene lugares");
  }
  const now = new Date().toISOString();
  const request = {
    tripId: trip.tripId,
    passengerId: me.userId,
    status: "pending",
    consentGivenAt: now,
    createdAt: now,
    updatedAt: now,
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

// DELETE /trips/{tripId}/requests  The passenger cancels their own request before the driver completes the trip.
async function cancelRequest(event) {
  const me = caller(event);
  const { tripId } = event.pathParameters;
  const [trip, request] = await Promise.all([loadTrip(tripId), loadRequest(tripId, me.userId)]);
  if (request?.status !== "pending" && request?.status !== "accepted") {
    throw new HttpError(404, "No tienes una solicitud activa en este viaje");
  }
  if (trip.status !== "Disponible") {
    throw new HttpError(409, "El viaje ya comenzó o terminó");
  }
  try {
    if (request.status === "pending") {
      await db.send(
        new UpdateCommand(requestStatusUpdate(tripId, me.userId, "pending", "cancelled")),
      );
    } else {
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

// POST /trips/{tripId}/status  { status: "Finalizado" | "Cancelado" }
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
  // Completing a trip closes it to new requests and rejects all still-pending requests.
  if (status === "Finalizado") {
    for (const request of await tripRequests(trip.tripId)) {
      if (request.status !== "pending") continue;
      await db
        .send(
          new UpdateCommand(
            requestStatusUpdate(trip.tripId, request.passengerId, "pending", "rejected"),
          ),
        )
        .catch((err) => {
          if (!isConditionFailed(err)) throw err;
        });
    }
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
  "PUT /trips/{tripId}/meeting-point": setMeetingPoint,
  "POST /trips/{tripId}/status": setTripStatus,
});
