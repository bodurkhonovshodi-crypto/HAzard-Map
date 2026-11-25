"""
Put a scanned or exported map image on the app map.
Works for maps drawn in geographic coordinates (straight lat/lon grid lines), like the AKAH Khorog maps.

You need the pixel positions of two longitude ticks and two latitude ticks
(open the image in Paint or GIMP and read the x/y of the mouse).

Example (the Khorog rockfall map):
    python tools/image_bounds.py source/khorog_rockfall_map.jpg data/overlays/khorog_rockfall_map.jpg \
        --lon-ticks 1034=71:31:40 3044=71:35:00 --lat-ticks 597=37:31:40 2607=37:28:20 \
        --crop 64 63 3955 3442 --id akah-khorog-rockfall --title "AKAH rockfall map, Khorog (2021)" \
        --attribution "Aga Khan Agency for Habitat, 2021" --js data/overlay_khorog_rockfall_map.js

--crop left top right bottom = the map frame in pixels (leaves out the legend and title).
Needs: pip install pillow
"""
import argparse, json
from PIL import Image

def web_path(p):
    """Image path as the app sees it: relative to www/ (so "www/data/overlays/x.png" -> "data/overlays/x.png")."""
    p = p.replace("\\", "/")
    for pre in ("./www/", "www/"):
        if p.startswith(pre):
            return p[len(pre):]
    return p

Image.MAX_IMAGE_PIXELS = None

def dms(s):
    parts = [float(p) for p in s.split(":")]
    return parts[0] + (parts[1] if len(parts) > 1 else 0) / 60 + (parts[2] if len(parts) > 2 else 0) / 3600

def tick_pair(items):
    (p1, d1), (p2, d2) = [(float(i.split("=")[0]), dms(i.split("=")[1])) for i in items]
    k = (d2 - d1) / (p2 - p1)
    return lambda p: d1 + (p - p1) * k

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image"); ap.add_argument("out_image")
    ap.add_argument("--lon-ticks", nargs=2, required=True, help="x=deg:min:sec x=deg:min:sec")
    ap.add_argument("--lat-ticks", nargs=2, required=True, help="y=deg:min:sec y=deg:min:sec")
    ap.add_argument("--crop", nargs=4, type=int, required=True, metavar=("LEFT", "TOP", "RIGHT", "BOTTOM"))
    ap.add_argument("--max-width", type=int, default=2400)
    ap.add_argument("--id", required=True); ap.add_argument("--title", required=True)
    ap.add_argument("--attribution", default=""); ap.add_argument("--js", required=True)
    a = ap.parse_args()

    lon, lat = tick_pair(a.lon_ticks), tick_pair(a.lat_ticks)
    l, t, r, b = a.crop
    bounds = [[round(lat(b), 7), round(lon(l), 7)], [round(lat(t), 7), round(lon(r), 7)]]   # [[south, west], [north, east]]

    im = Image.open(a.image).convert("RGB").crop((l, t, r, b))
    if im.width > a.max_width:
        im = im.resize((a.max_width, round(im.height * a.max_width / im.width)), Image.LANCZOS)
    im.save(a.out_image, quality=82, optimize=True)

    overlay = {"id": a.id, "title": a.title, "image": web_path(a.out_image), "bounds": bounds,
               "opacity": 0.85, "attribution": a.attribution, "show": True}
    with open(a.js, "w", encoding="utf-8") as f:
        f.write("// Made by tools/image_bounds.py\nregisterOverlay(" + json.dumps(overlay, ensure_ascii=False, indent=1) + ");\n")
    print("bounds (S,W),(N,E):", bounds, "→", a.js)

if __name__ == "__main__":
    main()
