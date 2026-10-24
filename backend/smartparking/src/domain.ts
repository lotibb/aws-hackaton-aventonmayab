export type Zone = {
  zoneId: string;
  name: string;
  occupied: number;
  capacity?: number;
  updatedAt: string;
};

export function presentZone(zone: Zone) {
  return {
    ...zone,
    capacity: zone.capacity ?? null,
    available: zone.capacity === undefined ? null : Math.max(0, zone.capacity - zone.occupied),
    occupancyPercentage: zone.capacity === undefined ? null : Math.round(zone.occupied / zone.capacity * 100),
    source: "manual" as const,
  };
}

export function parseZoneId(body: string | undefined): string {
  const value: unknown = JSON.parse(body ?? "{}");
  if (!value || typeof value !== "object" || !("zoneId" in value) ||
      typeof value.zoneId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value.zoneId)) {
    throw new Error("INVALID_ZONE_ID");
  }
  return value.zoneId;
}
