"""
Convert a POINT shapefile (.shp + .dbf, WGS 84 lat/lon) into a data file the app can load.
No extra packages needed.

Usage (from the project folder):
    python tools/shp_to_js.py "path/to/mudflows_shugnan" data/mudflows_shugnan.js --id mudflow-shugnan --title "Mudflow sites, Shugnan" --hazard mudflow

Give the path WITHOUT the .shp ending. Then add the new file to js/data-files.js:
    "data/mudflows_shugnan.js",

The layer must be in WGS 84 (EPSG:4326). If it is in UTM, reproject it first in QGIS:
right-click layer → Export → Save Features As… → CRS: EPSG:4326.
"""
import argparse, json, os, struct

def read_points(base):
    shp = open(base + ".shp", "rb").read()
    pts, i = [], 100
    while i + 8 <= len(shp):
        _, clen = struct.unpack(">ii", shp[i:i + 8])
        stype = struct.unpack("<i", shp[i + 8:i + 12])[0]
        if stype in (1, 11, 21):                      # Point, PointZ, PointM
            pts.append(struct.unpack("<dd", shp[i + 12:i + 28]))
        else:
            pts.append(None)
        i += 8 + clen * 2
    return pts

def read_dbf(base, encoding):
    dbf = open(base + ".dbf", "rb").read()
    nrec, hlen, rlen = struct.unpack("<IHH", dbf[4:12])
    fields, p = [], 32
    while dbf[p] != 0x0D:
        name = dbf[p:p + 11].split(b"\0")[0].decode(encoding, "replace")
        fields.append((name, chr(dbf[p + 11]), dbf[p + 16])); p += 32
    rows = []
    for k in range(nrec):
        row = dbf[hlen + k * rlen: hlen + (k + 1) * rlen]
        if row[:1] == b"*": rows.append(None); continue   # deleted record
        o, d = 1, {}
        for name, ftype, flen in fields:
            raw = row[o:o + flen].replace(b"\0", b" ").decode(encoding, "replace").strip(); o += flen
            if ftype in "NF" and raw:
                try: raw = float(raw); raw = int(raw) if raw.is_integer() else raw
                except ValueError: pass
            d[name] = raw
        rows.append(d)
    return [f[0] for f in fields], rows

# Fields left over from Google Earth (KML) exports that mean nothing on the map
SKIP = {"tessellate", "extrude", "visibility", "draworder", "altitudemo", "icon", "begin", "end", "timestamp"}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", help="shapefile path without .shp")
    ap.add_argument("out")
    ap.add_argument("--id", required=True); ap.add_argument("--title", required=True)
    ap.add_argument("--hazard", default="avalanche", help="avalanche, mudflow, flood, rockfall, landslide …")
    ap.add_argument("--name-field", default=None, help="attribute to use as the site name (default: Name)")
    a = ap.parse_args()

    base = a.base[:-4] if a.base.lower().endswith(".shp") else a.base
    enc = "utf-8"
    for ext in (".cpg", ".CPG"):
        if os.path.exists(base + ext):
            t = open(base + ext).read().strip().lower()
            enc = "cp1251" if "1251" in t else "utf-8" if "utf" in t else t or "utf-8"
    names, rows = read_dbf(base, enc)
    pts = read_points(base)
    name_field = a.name_field or next((n for n in names if n.lower() == "name"), names[0] if names else None)

    sites = []
    for idx, (pt, attrs) in enumerate(zip(pts, rows), start=1):
        if attrs is None or pt is None: continue
        lon, lat = pt
        if not (-90 <= lat <= 90 and -180 <= lon <= 180): continue   # empty geometry
        attrs = {k: v for k, v in attrs.items() if v not in ("", None, 0) and k != name_field and k.lower() not in SKIP}
        site = {"id": f"{a.id}-{idx}", "name": str(rows[idx - 1].get(name_field) or f"Site {idx}"),
                "lat": round(lat, 6), "lon": round(lon, 6), "attrs": attrs}
        if any("?" * 4 in str(v) for v in attrs.values()) or "????" in site["name"]:
            site["noteLost"] = True
        sites.append(site)

    dataset = {"id": a.id, "title": a.title, "hazard": a.hazard, "kind": "point",
               "source": os.path.basename(base) + ".shp", "sites": sites}
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("// Made by tools/shp_to_js.py — run the script again instead of editing by hand.\n")
        f.write("registerDataset(" + json.dumps(dataset, ensure_ascii=False, indent=1) + ");\n")
    print(f"{len(sites)} points (encoding {enc}, name field '{name_field}'). Wrote {a.out}")

if __name__ == "__main__":
    main()
