import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
async function main() {
  const table = process.env.ZONES_TABLE;
  if (!table) throw new Error("Define ZONES_TABLE con el output ZonesTable del despliegue.");
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" }));
  for (const zoneId of ["A", "B", "C"]) {
    try {
      await db.send(new PutCommand({ TableName: table, Item: { zoneId, name: `Zona ${zoneId} (demo)`, occupied: 0, updatedAt: new Date().toISOString() }, ConditionExpression: "attribute_not_exists(zoneId)" }));
      console.log(`Creada zona ${zoneId}`);
    } catch (e) {
      if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
      console.log(`Zona ${zoneId} ya existe; conservada.`);
    }
  }
}
void main().catch(e => { console.error((e as Error).message); process.exitCode = 1; });
