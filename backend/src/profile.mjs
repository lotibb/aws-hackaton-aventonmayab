import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { db, tables } from "./lib/db.mjs";
import { HttpError, caller, isConditionFailed, readBody, router } from "./lib/http.mjs";

const cognito = new CognitoIdentityProviderClient({});
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function optionalText(value, field, max) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) {
    throw new HttpError(400, `${field} inválido`);
  }
  return value.trim();
}

const query = (TableName, IndexName, key, value) =>
  db
    .send(
      new QueryCommand({
        TableName,
        IndexName,
        KeyConditionExpression: "#k = :v",
        ExpressionAttributeNames: { "#k": key },
        ExpressionAttributeValues: { ":v": value },
      }),
    )
    .then((r) => r.Items);

// Mexican mobile numbers: 10 digits, with or without +52 / 521, spaces or dashes.
function optionalPhone(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  const national = digits.length > 10 && /^521?/.test(digits) ? digits.replace(/^521?/, "") : digits;
  if (national.length !== 10) throw new HttpError(400, "Teléfono inválido, usa 10 dígitos");
  return national;
}

const remove = (TableName, Key) => db.send(new DeleteCommand({ TableName, Key }));

// GET /me
async function getProfile(event) {
  const me = caller(event);
  const { Item } = await db.send(
    new GetCommand({ TableName: tables.users, Key: { userId: me.userId } }),
  );
  return Item ?? { userId: me.userId, email: me.email };
}

// PUT /me  { name, colonia, phone, photoUrl, activeMode, privacyAcceptedAt }  Replaces the whole profile.
async function saveProfile(event) {
  const me = caller(event);
  const body = readBody(event);
  if (body.activeMode !== undefined && !["conductor", "pasajero"].includes(body.activeMode)) {
    throw new HttpError(400, "Modo inválido");
  }
  const { Item: existing } = await db.send(
    new GetCommand({ TableName: tables.users, Key: { userId: me.userId } }),
  );
  const now = new Date().toISOString();
  const profile = {
    userId: me.userId,
    email: me.email,
    name: optionalText(body.name, "Nombre", 80),
    colonia: optionalText(body.colonia, "Colonia", 80),
    phone: optionalPhone(body.phone),
    // A small, resized image (data URL); the frontend shrinks photos before sending them.
    photoUrl: optionalText(body.photoUrl, "Foto", 200_000),
    activeMode: body.activeMode,
    privacyAcceptedAt: optionalText(body.privacyAcceptedAt, "Fecha de privacidad", 40),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.send(new PutCommand({ TableName: tables.users, Item: profile }));
  return profile;
}

// GET /me/schedule  Only ever the caller's own schedule.
async function getSchedule(event) {
  const { userId } = caller(event);
  return query(tables.schedules, undefined, "userId", userId);
}

// PUT /me/schedule/{slotId}  { day: 1-7 (lunes-domingo), start, end, subject?, building?, room? }
async function saveSlot(event) {
  const { userId } = caller(event);
  const { slotId } = event.pathParameters;
  const { day, start, end, subject, building, room } = readBody(event);
  if (slotId.length > 64) throw new HttpError(400, "slotId demasiado largo");
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    throw new HttpError(400, "day debe ser de 1 (lunes) a 7 (domingo)");
  }
  if (!TIME.test(start) || !TIME.test(end) || start >= end) {
    throw new HttpError(400, "Horario inválido, usa HH:MM");
  }
  const slot = {
    userId,
    slotId,
    day,
    start,
    end,
    subject: optionalText(subject, "Materia", 100),
    building: optionalText(building, "Edificio", 80),
    room: optionalText(room, "Salón", 40),
  };
  await db.send(new PutCommand({ TableName: tables.schedules, Item: slot }));
  return slot;
}

// DELETE /me/schedule/{slotId}
async function deleteSlot(event) {
  const { userId } = caller(event);
  await remove(tables.schedules, { userId, slotId: event.pathParameters.slotId });
  return { deleted: true };
}

// DELETE /me  Deletes everything the student has, then the Cognito account.
async function deleteAccount(event) {
  const me = caller(event);
  const id = me.userId;

  // Seats the student was accepted into go back to their trips.
  for (const request of await query(tables.seatRequests, "byPassenger", "passengerId", id)) {
    if (request.status === "accepted") {
      await db
        .send(
          new UpdateCommand({
            TableName: tables.trips,
            Key: { tripId: request.tripId },
            UpdateExpression: "SET seatsLeft = seatsLeft + :one",
            ConditionExpression: "seatsLeft < seatsTotal",
            ExpressionAttributeValues: { ":one": 1 },
          }),
        )
        .catch((err) => {
          if (!isConditionFailed(err)) throw err;
        });
    }
    await remove(tables.seatRequests, { tripId: request.tripId, passengerId: id });
  }

  // Trips the student drives are deleted along with their requests.
  for (const trip of await query(tables.trips, "byDriver", "driverId", id)) {
    for (const request of await query(tables.seatRequests, undefined, "tripId", trip.tripId)) {
      await remove(tables.seatRequests, { tripId: trip.tripId, passengerId: request.passengerId });
    }
    await remove(tables.trips, { tripId: trip.tripId });
  }

  for (const slot of await query(tables.schedules, undefined, "userId", id)) {
    await remove(tables.schedules, { userId: id, slotId: slot.slotId });
  }
  await remove(tables.parkingSessions, { userId: id });
  await remove(tables.users, { userId: id });

  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: me.username,
    }),
  );
  return { deleted: true };
}

export const handler = router({
  "GET /me": getProfile,
  "PUT /me": saveProfile,
  "DELETE /me": deleteAccount,
  "GET /me/schedule": getSchedule,
  "PUT /me/schedule/{slotId}": saveSlot,
  "DELETE /me/schedule/{slotId}": deleteSlot,
});
