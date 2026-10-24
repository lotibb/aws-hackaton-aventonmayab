import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "../lib/db.mjs";
import catalog from "../lib/parking-catalog.json" with { type: "json" };
import { pathToFileURL } from "node:url";

// No scans of users or sessions, no resetting counters, and no deletion of legacy zones.
// Existing capacity overrides (including official ones) are retained.
export async function syncParkingZones(table, client = db) {
  if (!table) throw new Error("Define PARKING_ZONES_TABLE con la tabla del backend principal (aventon-parking-zones).");
  for (const zone of catalog) {
    await client.send(new UpdateCommand({
    TableName: table,
    Key: { zoneId: zone.id },
    UpdateExpression: "SET #name = :name, #area = :area, #capacity = if_not_exists(#capacity, :capacity), capacityEstimated = if_not_exists(capacityEstimated, :estimated), registeredOccupied = if_not_exists(registeredOccupied, :zero), updatedAt = if_not_exists(updatedAt, :now)",
    ExpressionAttributeNames: { "#name": "name", "#area": "area", "#capacity": "capacity" },
    ExpressionAttributeValues: {
      ":name": zone.name, ":area": zone.area, ":capacity": zone.capacity,
      ":estimated": zone.capacityEstimated, ":zero": 0, ":now": new Date().toISOString(),
    },
    }));
    console.log(`${zone.id}: metadatos sincronizados; capacidad y conteos existentes conservados.`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await syncParkingZones(process.env.PARKING_ZONES_TABLE);
}
