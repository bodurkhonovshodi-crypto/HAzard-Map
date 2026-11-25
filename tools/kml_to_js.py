"""
Convert a KML file (from Google Earth, ArcGIS or QGIS) into a data file the app can load.
Points become markers. Polygons become zone outlines on the map. No extra packages needed.

Usage (from the project folder):
    python tools/kml_to_js.py "source/SHUGNAN_ISHKOSHIM_AV.kml" data/avalanche_zones_shugnan_ishkashim.js \
        --id av-zones-07 --title "Avalanche zones 2017: Panj valley, Khorog to Ishkashim" --hazard avalanche

Then add the new file to js/data-files.js:
    "data/avalanche_zones_shugnan_ishkashim.js",

Attributes are read from <ExtendedData> and from the attribute tables ArcGIS writes into <description>.
KMZ files are zipped KML: unzip them first (rename .kmz to .zip and open it).
"""
import argparse, html, json, re

# Attributes that only describe the drawing, not the hazard
SKIP = {"oid", "folderpath", "symbolid", "altmode", "base", "clamped", "extruded", "snippet", "popupinfo",
        "shape", "shape_length", "shape_area", "name", "country name", "akdn_id", "site/area name"}

def cells(table_html):
    return [(html.unescape(k).strip(), html.unescape(re.sub(r"<[^>]+>", "", v)).strip())
            for k, v in re.findall(r"<td>([^<]*)</td>\s*<td>(.*?)</td>", table_html, flags=re.S)]

def attributes(pm):
    attrs = {}
    for k, v in re.findall(r'<(?:Simple)?Data name="([^"]+)"[^>]*>\s*(?:<value>)?([^<]*)', pm):
        attrs[k] = v.strip()
    d = re.search(r"<description>(.*?)</description>", pm, flags=re.S)
    if d:
        desc = d.group(1)
        desc = re.sub(r"^\s*<!\[CDATA\[|\]\]>\s*$", "", desc.strip())
        outer = cells(desc)
        for k, v in outer:
            attrs.setdefault(k, v)
        popup = re.search(r"<td>PopupInfo</td>\s*<td>(.*?)</td>\s*</tr>", desc, flags=re.S)
        if popup:                                   # ArcGIS puts the real attributes in an escaped table here
            for k, v in cells(html.unescape(popup.group(1))):
                attrs[k] = v
    return {k: v for k, v in attrs.items() if k.lower() not in SKIP and v not in ("", "0", "<Null>")}

def coords(text):
    pts = []
    for c in text.split():
        p = c.split(",")
        if len(p) >= 2: pts.append([round(float(p[1]), 6), round(float(p[0]), 6)])   # [lat, lon]
    return pts

def ring_area_centroid(ring):
    a = cx = cy = 0.0
    for (y1, x1), (y2, x2) in zip(ring, ring[1:] + ring[:1]):
        f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f
    if abs(a) < 1e-15:
        return 0, sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return abs(a / 2), cy / (3 * a), cx / (3 * a)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kml"); ap.add_argument("out")
    ap.add_argument("--id", required=True); ap.add_argument("--title", required=True)
    ap.add_argument("--hazard", default="avalanche")
    a = ap.parse_args()

    s = open(a.kml, encoding="utf-8").read()
    sites = []
    for i, pm in enumerate(re.findall(r"<Placemark.*?</Placemark>", s, flags=re.S), start=1):
        name = html.unescape((re.search(r"<name>(.*?)</name>", pm, flags=re.S) or [None, f"Site {i}"])[1]).strip()
        site = {"id": f"{a.id}-{i}", "name": re.sub(r"\s+", " ", name), "attrs": attributes(pm)}
        rings = [coords(re.search(r"<coordinates>(.*?)</coordinates>", ob, flags=re.S).group(1))
                 for ob in re.findall(r"<outerBoundaryIs>.*?</outerBoundaryIs>", pm, flags=re.S)]
        if rings:
            site["shape"] = rings
            best = max((ring_area_centroid(r) for r in rings), key=lambda t: t[0])
            site["lat"], site["lon"] = round(best[1], 6), round(best[2], 6)
        else:
            pt = re.search(r"<Point>.*?<coordinates>(.*?)</coordinates>", pm, flags=re.S)
            line = re.search(r"<LineString>.*?<coordinates>(.*?)</coordinates>", pm, flags=re.S)
            if pt:
                site["lat"], site["lon"] = coords(pt.group(1))[0]
            elif line:
                pts = coords(line.group(1)); site["line"] = pts
                site["lat"], site["lon"] = pts[len(pts) // 2]
            else:
                site["lat"] = site["lon"] = None; site["noGps"] = "No geometry in the KML"
        if not site["attrs"]: del site["attrs"]
        sites.append(site)

    dataset = {"id": a.id, "title": a.title, "hazard": a.hazard, "kind": "zone-shapes",
               "source": a.kml.replace("\\", "/").split("/")[-1], "sites": sites}
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("// Made by tools/kml_to_js.py — run the script again instead of editing by hand.\n")
        f.write("registerDataset(" + json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + ");\n")
    n_poly = sum(1 for x in sites if "shape" in x)
    print(f"{len(sites)} placemarks ({n_poly} polygons). Wrote {a.out}")

if __name__ == "__main__":
    main()
