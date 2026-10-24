#!/usr/bin/env python3
"""Builds frontend/lib/colonias-data.json from the GeoNames postal-code dump for Mexico.

Source: https://download.geonames.org/export/zip/MX.zip (GeoNames, CC BY 4.0, https://www.geonames.org).
Usage:  python3 frontend/scripts/build-colonias.py path/to/MX.txt

Each entry is [label, postal code, municipio, lat, lng]. The coordinates are the approximate
center of the colonia (or of its postal code), never a person's location.
"""
import json
import pathlib
import sys
import unicodedata

# Where Anáhuac Mayab students commute from.
MUNICIPIOS = ["Mérida", "Kanasín", "Umán", "Conkal", "Progreso", "Ucú", "Tixpéhual", "Chicxulub Pueblo"]

# Colonias the app offered before this catalog; profiles and trips already store these names.
LEGACY = [
    "Montebello", "Altabrisa", "Cholul", "Francisco de Montejo", "Gran Santa Fe",
    "García Ginerés", "Temozón Norte", "Las Américas", "Caucel", "Centro",
]

OUT = pathlib.Path(__file__).resolve().parent.parent / "lib" / "colonias-data.json"


def norm(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(text.lower().split())


def read_rows(path):
    wanted = {norm(m): m for m in MUNICIPIOS}
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 11 or norm(cols[3]) != "yucatan" or norm(cols[5]) not in wanted:
                continue
            if not cols[9] or not cols[10]:
                continue
            rows.append({
                "name": cols[2].strip(),
                "cp": cols[1].strip(),
                "municipio": wanted[norm(cols[5])],
                "lat": float(cols[9]),
                "lng": float(cols[10]),
            })
    return rows


def dedupe(rows):
    # The same colonia can appear more than once per postal code; keep one row per name + CP.
    seen = {}
    for r in rows:
        seen.setdefault((norm(r["name"]), r["municipio"], r["cp"]), r)
    return list(seen.values())


def add_labels(rows):
    # Labels must be unique: plain name when possible, then "(Municipio)", then "(CP …)".
    by_name = {}
    for r in rows:
        by_name.setdefault(norm(r["name"]), []).append(r)
    for same in by_name.values():
        in_merida = [r for r in same if r["municipio"] == "Mérida"]
        for r in same:
            if len(same) == 1 or (len(in_merida) == 1 and r is in_merida[0]):
                r["label"] = r["name"]
            elif sum(1 for o in same if o["municipio"] == r["municipio"]) == 1:
                r["label"] = f'{r["name"]} ({r["municipio"]})'
            elif r["municipio"] == "Mérida":
                r["label"] = f'{r["name"]} (CP {r["cp"]})'
            else:
                r["label"] = f'{r["name"]} ({r["municipio"]}, CP {r["cp"]})'
    labels = [r["label"] for r in rows]
    assert len(labels) == len(set(labels)), "duplicate labels"


def add_legacy_aliases(rows):
    # Keep old stored names valid: alias them to the closest catalog match in Mérida.
    labels = {r["label"] for r in rows}
    for legacy in LEGACY:
        if legacy in labels:
            continue
        key = norm(legacy)
        merida = [r for r in rows if r["municipio"] == "Mérida"]
        match = next((r for r in merida if norm(r["name"]) == key), None) or next(
            (r for r in merida if f" {key} " in f' {norm(r["name"])} '), None
        )
        if not match:
            print(f"WARNING: no catalog match for legacy colonia {legacy!r}", file=sys.stderr)
            continue
        rows.append({**match, "label": legacy})
        print(f"alias {legacy!r} -> {match['label']!r} (CP {match['cp']})")


def main(path):
    rows = dedupe(read_rows(path))
    if not rows:
        sys.exit("No rows for Yucatán: is this the GeoNames MX.txt file?")
    add_labels(rows)
    add_legacy_aliases(rows)
    rows.sort(key=lambda r: norm(r["label"]))
    data = [[r["label"], r["cp"], r["municipio"], round(r["lat"], 5), round(r["lng"], 5)] for r in rows]
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    counts = {m: sum(1 for r in rows if r["municipio"] == m) for m in MUNICIPIOS}
    print(f"{len(data)} colonias -> {OUT}")
    print(counts)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
