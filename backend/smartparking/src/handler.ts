import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { parseZoneId, presentZone, Zone } from "./domain";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const zones = process.env.ZONES_TABLE!;
const sessions = process.env.SESSIONS_TABLE!;
const reply = (statusCode: number, data: unknown): APIGatewayProxyResultV2 => ({
  statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(data),
});
const error = (status: number, code: string, message: string) => reply(status, { error: { code, message } });

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof userId !== "string" || !userId || event.requestContext.authorizer?.jwt?.claims?.token_use !== "access") return error(401, "UNAUTHORIZED", "Envía un access token de Cognito válido.");
  try {
    switch (event.routeKey) {
      case "GET /parking/zones": {
        const items: Zone[] = [];
        let cursor: Record<string, unknown> | undefined;
        do {
          const page = await db.send(new ScanCommand({ TableName: zones, ExclusiveStartKey: cursor }));
          items.push(...(page.Items ?? []) as Zone[]);
          cursor = page.LastEvaluatedKey;
        } while (cursor);
        return reply(200, { zones: items.sort((a, b) => a.zoneId.localeCompare(b.zoneId)).map(presentZone) });
      }
      case "GET /parking/session": {
        const result = await db.send(new GetCommand({ TableName: sessions, Key: { userId }, ConsistentRead: true }));
        return reply(200, { session: result.Item ?? null });
      }
      case "POST /parking/entry": {
        let zoneId: string;
        try { zoneId = parseZoneId(event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString() : event.body); }
        catch { return error(400, "INVALID_BODY", "Envía un JSON con zoneId válido."); }
        const zone = await db.send(new GetCommand({ TableName: zones, Key: { zoneId }, ConsistentRead: true }));
        if (!zone.Item) return error(404, "ZONE_NOT_FOUND", "La zona no existe.");
        const session = { userId, zoneId, sessionId: randomUUID(), enteredAt: new Date().toISOString() };
        try {
          await db.send(new TransactWriteCommand({ TransactItems: [
            { Put: { TableName: sessions, Item: session, ConditionExpression: "attribute_not_exists(userId)" } },
            { Update: { TableName: zones, Key: { zoneId },
              UpdateExpression: "SET occupied = occupied + :one, updatedAt = :now",
              ConditionExpression: "attribute_exists(zoneId) AND (attribute_not_exists(capacity) OR occupied < capacity)",
              ExpressionAttributeValues: { ":one": 1, ":now": session.enteredAt } } },
          ] }));
        } catch (e) {
          if ((e as Error).name === "TransactionCanceledException") return error(409, "ENTRY_CONFLICT", "Ya tienes una sesión activa, la zona está llena o hubo una operación concurrente. Consulta tu sesión y las zonas.");
          throw e;
        }
        return reply(201, { session });
      }
      case "POST /parking/exit": {
        const result = await db.send(new GetCommand({ TableName: sessions, Key: { userId }, ConsistentRead: true }));
        if (!result.Item) return error(409, "NO_ACTIVE_SESSION", "No tienes una sesión activa.");
        const session = result.Item;
        const exitedAt = new Date().toISOString();
        try {
          await db.send(new TransactWriteCommand({ TransactItems: [
            { Delete: { TableName: sessions, Key: { userId }, ConditionExpression: "sessionId = :id", ExpressionAttributeValues: { ":id": session.sessionId } } },
            { Update: { TableName: zones, Key: { zoneId: session.zoneId },
              UpdateExpression: "SET occupied = occupied - :one, updatedAt = :now", ConditionExpression: "occupied > :zero",
              ExpressionAttributeValues: { ":one": 1, ":zero": 0, ":now": exitedAt } } },
          ] }));
        } catch (e) {
          if ((e as Error).name === "TransactionCanceledException") return error(409, "EXIT_CONFLICT", "La sesión cambió o el contador requiere revisión. Actualiza antes de reintentar.");
          throw e;
        }
        return reply(200, { session: null, exitedAt });
      }
      default: return error(404, "NOT_FOUND", "Ruta no encontrada.");
    }
  } catch (e) {
    console.error(JSON.stringify({ requestId: event.requestContext.requestId, error: (e as Error).name }));
    return error(500, "INTERNAL_ERROR", "No fue posible completar la operación.");
  }
}
