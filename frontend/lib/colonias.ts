import data from './colonias-data.json'

/**
 * Colonias of Mérida and nearby municipalities with their approximate center.
 * Built by scripts/build-colonias.py from GeoNames postal-code data (CC BY 4.0, https://www.geonames.org).
 * The coordinates belong to the colonia, never to a person.
 */
export interface ColoniaInfo {
  /** Unique display name, e.g. "Montebello" or "Centro (Kanasín)". */
  name: string
  cp: string
  municipio: string
  lat: number
  lng: number
}

export const COLONIA_CATALOG: ColoniaInfo[] = (data as Array<[string, string, string, number, number]>).map(
  ([name, cp, municipio, lat, lng]) => ({ name, cp, municipio, lat, lng }),
)

export const COLONIAS: readonly string[] = COLONIA_CATALOG.map((c) => c.name)

export type Colonia = string

const byName = new Map(COLONIA_CATALOG.map((c) => [c.name, c]))

export function findColonia(name: string | undefined): ColoniaInfo | undefined {
  return name ? byName.get(name) : undefined
}

/** Trips leaving from colonias within this distance show up as "cerca". */
export const NEARBY_KM = 3

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
