import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

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
