import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const tables = {
  users: process.env.USERS_TABLE,
  trips: process.env.TRIPS_TABLE,
  seatRequests: process.env.SEAT_REQUESTS_TABLE,
  parkingZones: process.env.PARKING_ZONES_TABLE,
  parkingSessions: process.env.PARKING_SESSIONS_TABLE,
  schedules: process.env.SCHEDULES_TABLE,
};

// Name other students see: the profile name, else the part of the email before "@".
export async function displayName({ userId, email }) {
  const { Item } = await db.send(
    new GetCommand({ TableName: tables.users, Key: { userId } }),
  );
  return Item?.name || email?.split("@")[0] || "Estudiante";
}
