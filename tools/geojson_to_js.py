"""
Turn a GeoJSON file (boundaries, roads, glaciers, population hexagons …) into a map layer for the app.

Usage (from the project folder):
    python tools/geojson_to_js.py gbao_districts.geojson data/layer_gbao_districts.js --title "GBAO districts" --color "#5b4a8a"

Then add the new file to js/data-files.js:
    "data/layer_gbao_districts.js",

Tips
- The GeoJSON must be in lat/lon (EPSG:4326). In QGIS: right-click layer → Export → Save Features As → GeoJSON, CRS EPSG:4326.
- Clip big layers to your area first; a web page gets slow above a few MB.
- --digits 5 rounds coordinates to about 1 m and makes the file much smaller.
- --keep lets you keep only some attributes, for example --keep name population
"""
import argparse, json, os

def round_coords(c, d):
    if isinstance(c, (int, float)): return round(c, d)
    return [round_coords(x, d) for x in c]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("geojson"); ap.add_argument("out")
    ap.add_argument("--title", required=True); ap.add_argument("--color", default="#5b4a8a")
    ap.add_argument("--id", default=None); ap.add_argument("--hide", action="store_true", help="start with the layer switched off")
    ap.add_argument("--digits", type=int, default=5); ap.add_argument("--keep", nargs="*", default=None)
    a = ap.parse_args()

    gj = json.load(open(a.geojson, encoding="utf-8"))
    crs = json.dumps(gj.get("crs", ""))
    if any(code in crs for code in ("3857", "32642", "32643", "32641")):
        raise SystemExit("This GeoJSON is not in lat/lon. Save it again with CRS EPSG:4326.")
    feats = gj["features"] if gj.get("type") == "FeatureCollection" else [gj]
    for f in feats:
        if f.get("geometry"): f["geometry"]["coordinates"] = round_coords(f["geometry"]["coordinates"], a.digits)
        if a.keep is not None: f["properties"] = {k: v for k, v in (f.get("properties") or {}).items() if k in a.keep}
    layer = {"id": a.id or os.path.splitext(os.path.basename(a.out))[0], "title": a.title, "color": a.color, "show": not a.hide,
             "source": os.path.basename(a.geojson), "geojson": {"type": "FeatureCollection", "features": feats}}
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("// Made by tools/geojson_to_js.py\nregisterGeoLayer(" + json.dumps(layer, ensure_ascii=False, separators=(",", ":")) + ");\n")
    print(f"{len(feats)} features, {os.path.getsize(a.out) / 1e6:.1f} MB. Wrote {a.out}. Now add it to js/data-files.js.")

if __name__ == "__main__":
    main()
