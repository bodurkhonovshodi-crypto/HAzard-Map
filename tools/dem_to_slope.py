"""
Turn a DEM (elevation raster) into a slope map overlay for the app.

Slope is the first step to "find dangerous zones automatically":
  - 30–45°  : slopes where snow avalanches usually start
  - over 45°: steep rock where rockfall usually starts
(These classes are simple rules of thumb. Change them in CLASSES below.)

Input, one of:
  - an ESRI ASCII grid (.asc). In QGIS: Raster → Conversion → Translate, format "Arc/Info ASCII Grid".
    In ArcGIS: Conversion Tools → From Raster → Raster to ASCII.
  - an ArcInfo binary grid FOLDER (the folder that holds hdr.adf, dblbnd.adf, w001001.adf, w001001x.adf).
    All of these files are needed, dblbnd.adf too (it says where the grid is).

The DEM can be in UTM (give --utm-zone, 42 for most of GBAO) or in lat/lon degrees (give --geographic).

Example:
    pip install numpy pillow
    python tools/dem_to_slope.py "C:/GIS/dem_shokhdara" data/overlays/slope_shokhdara.png --utm-zone 42 \
        --id slope-shokhdara --title "Slope classes, Shokhdara DEM" --js data/overlay_slope_shokhdara.js

Then add the new file to js/data-files.js:  "data/overlay_slope_shokhdara.js",
"""
import argparse, json, math, os, struct, sys
import numpy as np
from PIL import Image

def web_path(p):
    """Image path as the app sees it: relative to www/ (so "www/data/overlays/x.png" -> "data/overlays/x.png")."""
    p = p.replace("\\", "/")
    for pre in ("./www/", "www/"):
        if p.startswith(pre):
            return p[len(pre):]
    return p


# (min slope, max slope, RGBA colour, legend text)
CLASSES = [
    (30, 45, (232, 140, 30, 170), "30–45°: avalanche release slopes"),
    (45, 90, (150, 30, 120, 190), "over 45°: steep rock, rockfall sources"),
]
NODATA = np.nan

# ---------------- readers ----------------
def read_asc(path):
    head, n = {}, 0
    with open(path) as f:
        while True:
            pos = f.tell(); line = f.readline()
            key = line.split()[0].lower() if line.split() else ""
            if key in ("ncols", "nrows", "xllcorner", "yllcorner", "xllcenter", "yllcenter", "cellsize", "nodata_value"):
                head[key] = float(line.split()[1]); n += 1
            else:
                f.seek(pos); break
        data = np.loadtxt(f, dtype=float)
    cell = head["cellsize"]
    xll = head.get("xllcorner", head.get("xllcenter", 0) - cell / 2)
    yll = head.get("yllcorner", head.get("yllcenter", 0) - cell / 2)
    if "nodata_value" in head: data[data == head["nodata_value"]] = NODATA
    top = yll + data.shape[0] * cell
    return data, xll, top, cell

def read_aig(folder):
    """ArcInfo binary grid (integer or float). Tested with raw 32-bit tiles."""
    p = lambda n: os.path.join(folder, n)
    h = open(p("hdr.adf"), "rb").read()
    cell_type = struct.unpack(">i", h[16:20])[0]          # 1 = integer, 2 = float
    cell = struct.unpack(">d", h[256:264])[0]
    bpr = struct.unpack(">i", h[288:292])[0]; bw = struct.unpack(">i", h[296:300])[0]; bh = struct.unpack(">i", h[304:308])[0]
    idx = open(p("w001001x.adf"), "rb").read()[100:]
    xref, yref = struct.unpack(">dd", h[272:288])
    bounds = None
    if os.path.exists(p("dblbnd.adf")):
        raw_b = open(p("dblbnd.adf"), "rb").read()
        if len(raw_b) == 32:
            xmin, ymin, xmax, ymax = struct.unpack(">4d", raw_b)
            if xmin < xmax and ymin < ymax: bounds = (xmin, ymin, xmax, ymax)
    if bounds is None:
        # dblbnd.adf is missing or broken (for example damaged by an upload).
        # In the GBAO grids we checked, the top-left corner is always 1024 cells right of and
        # 3072 cells above the reference point in hdr.adf. Checked on 3 grids and on Yashilkul lake.
        print("WARNING: dblbnd.adf missing or damaged. Using the corner rule from hdr.adf. Check the result in QGIS.")
        nrows_tiles = (len(idx) // 8 + bpr - 1) // bpr * bh
        xmin, ymax = xref + 1024 * cell, yref + 3072 * cell
        bounds = (xmin, ymax - nrows_tiles * cell, xmin + bpr * bw * cell, ymax)
    xmin, ymin, xmax, ymax = bounds
    ncols, nrows = int(round((xmax - xmin) / cell)), int(round((ymax - ymin) / cell))
    raw = open(p("w001001.adf"), "rb").read()
    out = np.full((((nrows + bh - 1) // bh) * bh, bpr * bw), np.nan)
    for t in range(len(idx) // 8):
        off, size = struct.unpack(">ii", idx[t * 8:t * 8 + 8])
        if size == 0: continue
        off *= 2
        ds = struct.unpack(">h", raw[off:off + 2])[0] * 2
        b = raw[off + 2:off + 2 + ds]
        r, c = divmod(t, bpr)
        if r * bh >= out.shape[0]: break
        npx = bw * bh
        if cell_type == 2:
            vals = np.array(struct.unpack(">%df" % npx, b[:4 * npx]))
            vals[vals < -3.4e38] = np.nan
        elif ds == 4 * npx:
            vals = np.array(struct.unpack(">%di" % npx, b), dtype=float)
            vals[vals == -2147483647] = np.nan
        else:
            vals = decode_int_block(b, npx)
        out[r * bh:(r + 1) * bh, c * bw:(c + 1) * bw] = vals.reshape(bh, bw)
    return out[:nrows, :ncols], xmin, ymax, cell

def decode_int_block(b, n):
    magic = b[0]; ms = b[1]
    mn = int.from_bytes(b[2:2 + ms], "big", signed=True) if ms else 0
    d = b[2 + ms:]; v = []
    if magic == 0x00: v = [mn] * n
    elif magic == 0x08: v = [x + mn for x in d[:n]]
    elif magic == 0x10: v = [x + mn for x in struct.unpack(">%dh" % n, d[:2 * n])]
    elif magic == 0x20: v = [x + mn for x in struct.unpack(">%di" % n, d[:4 * n])]
    elif magic in (0xF8, 0xFC, 0xF0, 0xE0):
        sz = {0xF8: 1, 0xFC: 1, 0xF0: 2, 0xE0: 4}[magic]; i = 0
        while len(v) < n and i < len(d):
            cnt = d[i]; i += 1
            v += [int.from_bytes(d[i:i + sz], "big", signed=sz > 1) + mn] * cnt; i += sz
    elif magic == 0xDF:
        i = 0
        while len(v) < n and i < len(d):
            cnt = d[i]; i += 1
            v += [mn] * cnt if cnt < 128 else [math.nan] * (256 - cnt)
    elif magic in (0xD7, 0xCF):
        sz = 1 if magic == 0xD7 else 2; i = 0
        while len(v) < n and i < len(d):
            cnt = d[i]; i += 1
            if cnt < 128:
                for _ in range(cnt):
                    v.append(int.from_bytes(d[i:i + sz], "big") + mn); i += sz
            else:
                v += [math.nan] * (256 - cnt)
    else:
        sys.exit(f"This grid uses a tile format (0x{magic:02X}) the script cannot read. Export it as .asc instead.")
    return np.array((v + [math.nan] * n)[:n], dtype=float)

# ---------------- UTM (WGS 84) ----------------
A = 6378137.0; F = 1 / 298.257223563; E2 = F * (2 - F); EP2 = E2 / (1 - E2); K0 = 0.9996

def ll_to_utm(lat, lon, zone):
    lat, lon = np.radians(lat), np.radians(lon)
    lon0 = np.radians((zone - 1) * 6 - 180 + 3)
    N = A / np.sqrt(1 - E2 * np.sin(lat) ** 2); T = np.tan(lat) ** 2; C = EP2 * np.cos(lat) ** 2
    Aa = np.cos(lat) * (lon - lon0)
    M = A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * lat - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * np.sin(2 * lat)
             + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * np.sin(4 * lat) - (35 * E2 ** 3 / 3072) * np.sin(6 * lat))
    x = K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * EP2) * Aa ** 5 / 120) + 500000
    y = K0 * (M + N * np.tan(lat) * (Aa ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * Aa ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * EP2) * Aa ** 6 / 720))
    return x, y

def utm_to_ll(x, y, zone):
    x = x - 500000.0; M = y / K0
    mu = M / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
    p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * np.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * np.sin(4 * mu) + (151 * e1 ** 3 / 96) * np.sin(6 * mu)
    N1 = A / np.sqrt(1 - E2 * np.sin(p1) ** 2); T1 = np.tan(p1) ** 2; C1 = EP2 * np.cos(p1) ** 2
    R1 = A * (1 - E2) / (1 - E2 * np.sin(p1) ** 2) ** 1.5; D = x / (N1 * K0)
    lat = p1 - (N1 * np.tan(p1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4 / 24)
    lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6) / np.cos(p1)
    return np.degrees(lat), (zone - 1) * 6 - 180 + 3 + np.degrees(lon)

# ---------------- main ----------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dem", help=".asc file or ArcInfo grid folder")
    ap.add_argument("out_png")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--utm-zone", type=int, help="UTM zone (northern hemisphere), e.g. 42")
    g.add_argument("--geographic", action="store_true", help="DEM is in lat/lon degrees")
    ap.add_argument("--smooth", type=int, default=1, help="smooth the DEM this many times before slope (removes stair-step noise)")
    ap.add_argument("--keep-zero", action="store_true", help="keep cells with value 0 (by default they count as empty)")
    ap.add_argument("--id", required=True); ap.add_argument("--title", required=True); ap.add_argument("--js", required=True)
    a = ap.parse_args()

    dem, left, top, cell = read_asc(a.dem) if a.dem.lower().endswith(".asc") else read_aig(a.dem)
    if not a.keep_zero:
        dem[dem <= 0] = np.nan                    # empty cells are often stored as 0; no land in GBAO is that low
    ok = ~np.isnan(dem)                           # cut away empty rows and columns around the data
    rows, cols = np.where(ok.any(1))[0], np.where(ok.any(0))[0]
    dem = dem[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    left, top = left + cols.min() * cell, top - rows.min() * cell
    print(f"DEM {dem.shape[1]} x {dem.shape[0]} cells, cell {cell:g}, elevation {np.nanmin(dem):.0f}–{np.nanmax(dem):.0f}")

    z = dem.copy()
    for _ in range(a.smooth):                     # 3x3 mean, ignoring empty cells
        pad = np.pad(z, 1, mode="edge"); s = np.zeros_like(z); w = np.zeros_like(z)
        for dy in (0, 1, 2):
            for dx in (0, 1, 2):
                win = pad[dy:dy + z.shape[0], dx:dx + z.shape[1]]
                ok = ~np.isnan(win); s[ok] += win[ok]; w[ok] += 1
        z = np.where(np.isnan(dem), np.nan, s / np.maximum(w, 1))

    if a.geographic:
        lat_c = top - z.shape[0] * cell / 2
        dx_m, dy_m = cell * 111320 * math.cos(math.radians(lat_c)), cell * 110540
    else:
        dx_m = dy_m = cell
    gy, gx = np.gradient(z, dy_m, dx_m)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))

    # Output grid in lat/lon (what Leaflet needs), sampled from the DEM grid
    H, W = slope.shape
    if a.geographic:
        south, west, north, east = top - H * cell, left, top, left + W * cell
    else:
        xs = np.array([left, left + W * cell, left, left + W * cell]); ys = np.array([top, top, top - H * cell, top - H * cell])
        la, lo = utm_to_ll(xs, ys, a.utm_zone)
        south, north, west, east = la.min(), la.max(), lo.min(), lo.max()
    out_w = min(W, 2000); out_h = int(round(out_w * (north - south) / ((east - west) * math.cos(math.radians((north + south) / 2)))))
    lats = np.linspace(north, south, out_h)[:, None] * np.ones((1, out_w))
    lons = np.ones((out_h, 1)) * np.linspace(west, east, out_w)[None, :]
    if a.geographic:
        col = ((lons - left) / cell).astype(int); row = ((top - lats) / cell).astype(int)
    else:
        x, y = ll_to_utm(lats, lons, a.utm_zone)
        col = ((x - left) / cell).astype(int); row = ((top - y) / cell).astype(int)
    inside = (col >= 0) & (col < W) & (row >= 0) & (row < H)
    s = np.full((out_h, out_w), np.nan)
    s[inside] = slope[row[inside], col[inside]]

    rgba = np.zeros((out_h, out_w, 4), dtype=np.uint8)
    stats = []
    for lo_, hi_, color, label in CLASSES:
        m = (s >= lo_) & (s < hi_)
        rgba[m] = color
        valid = ~np.isnan(slope)
        stats.append(f"{label}: {((slope[valid] >= lo_) & (slope[valid] < hi_)).mean() * 100:.1f}% of the DEM area")
    Image.fromarray(rgba, "RGBA").save(a.out_png, optimize=True)

    overlay = {"id": a.id, "title": a.title, "image": web_path(a.out_png),
               "bounds": [[round(south, 7), round(west, 7)], [round(north, 7), round(east, 7)]], "opacity": 1, "show": True,
               "legend": [{"color": "rgba(%d,%d,%d,%.2f)" % (c[0], c[1], c[2], c[3] / 255), "label": l} for _, _, c, l in CLASSES],
               "attribution": "Slope from DEM: " + os.path.basename(a.dem.rstrip("/\\"))}
    with open(a.js, "w", encoding="utf-8") as f:
        f.write("// Made by tools/dem_to_slope.py\nregisterOverlay(" + json.dumps(overlay, ensure_ascii=False, indent=1) + ");\n")
    print("\n".join(stats)); print("Wrote", a.out_png, "and", a.js)

if __name__ == "__main__":
    main()
