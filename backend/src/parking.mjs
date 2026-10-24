import { caller, HttpError, readBody, router } from "./lib/http.mjs";
import { enterParking, getParkingSession, leaveParking, listParkingZones } from "./lib/parking-store.mjs";

async function registerEntry(event) {
  const body = readBody(event);
  const zoneId = body?.zoneId;
  if (typeof zoneId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(zoneId)) {
    throw new HttpError(400, "Zona inválida");
  }
  return { session: await enterParking(caller(event).userId, zoneId) };
}

export const handler = router({
  "GET /parking/zones": listParkingZones,
  "GET /parking/session": async (event) => ({ session: await getParkingSession(caller(event).userId) }),
  "POST /parking/entry": registerEntry,
  "POST /parking/exit": (event) => leaveParking(caller(event).userId),
});
