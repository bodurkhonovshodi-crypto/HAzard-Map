"""
Convert the Khorog rockfall table (Table 3.2, "Развития камнепадов и осыпей", AKAH 2020)
into a data file the app can load. The table has no coordinates, so positions come from
a small CSV file (code, lat, lon, method) — one line per zone code (RF-01, RF-02 …).

Usage (from the project folder):
    pip install openpyxl
    python tools/rockfall_table_to_js.py source/Khorog_rockfall_table_3.2.xlsx source/khorog_rockfall_positions.csv data/rockfall_khorog_2020.js

The table must be .xlsx. Open an old .xls in Excel and use "Save As → Excel Workbook (.xlsx)".
To improve a position: change its lat/lon in the CSV (for example after checking in QGIS) and run the script again.
"""
import argparse, csv, json, re, sys
import openpyxl

LAT = {"а":"a","б":"b","в":"v","г":"g","ғ":"gh","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","ӣ":"i","й":"y",
       "к":"k","қ":"q","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ӯ":"u","ф":"f",
       "х":"kh","ҳ":"h","ц":"ts","ч":"ch","ҷ":"j","ш":"sh","щ":"sh","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"}

def translit(s):
    s = re.sub(r"\s+", " ", str(s or "")).strip().replace("Дж", "Ҷ").replace("дж", "ҷ")
    out = []
    for ch in s:
        low = ch.lower()
        t = LAT.get(low)
        out.append(ch if t is None else (t.capitalize() if ch != low and t else t))
    return "".join(out)

def clean(v):
    if v is None: return ""
    return re.sub(r"[ \t]+", " ", str(v)).replace(" \n", "\n").strip()

def num(v):
    if isinstance(v, (int, float)): return v
    try: return float(str(v).replace(",", ".").strip())
    except (TypeError, ValueError): return None

def frequency(text):
    """'RF_S1_1/1-1/10  RF_S2_1/10-1/50' -> 'S1: every 1–10 years; S2: every 10–50 years'"""
    parts = []
    for scen, a, b in re.findall(r"(S\d)_1/(\d+)\s*-\s*1/(\d+)", text or ""):
        parts.append(f"{scen}: once every {a}–{b} years" if a != "1" else f"{scen}: from every year to once every {b} years")
    return "; ".join(parts)

def site_name(text):
    """'Участок Паринен (С.Абдуллоев) (RF-04-S1, S2)' -> 'Паринен (С.Абдуллоев)'"""
    t = re.sub(r"\(?\s*RF-?\s*\d+[^)]*\)?", "", text or "")
    t = re.sub(r"(?i)^\s*участок\s*", "", t)
    return re.sub(r"\s+", " ", t).strip(" -,.")

def short_name(ru):
    """Latin short name for the map: 'Гулакен и территории автостанции (…)' -> 'Gulaken'"""
    t = re.split(r"\(|\s+и\s+террит|,", ru)[0]
    t = t.replace(" и ", " and ").replace("Аэропорт", "Airport").replace("Ботсад", "Botanical Garden")
    return translit(t).strip(" .")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx"); ap.add_argument("positions_csv"); ap.add_argument("out")
    ap.add_argument("--id", default="rockfall-khorog-2020")
    ap.add_argument("--title", default="Rockfall zones, Khorog (AKAH, 2020)")
    a = ap.parse_args()

    pos = {}
    with open(a.positions_csv, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pos[r["code"].strip()] = (float(r["lat"]), float(r["lon"]), r.get("method", ""))

    ws = openpyxl.load_workbook(a.xlsx, data_only=True).worksheets[0]
    zones, district = {}, ""
    for r in ws.iter_rows(values_only=True):
        r = list(r) + [None] * 20
        m = re.search(r"RF-?\s*0*(\d+)", str(r[2] or ""))
        if not m: continue
        code = f"RF-{int(m.group(1)):02d}"
        if r[1]: district = clean(r[1]).replace("\n", " ")
        sub = {
            "site_ru": site_name(r[2]), "site": short_name(site_name(r[2])),
            "microdistrict_ru": district,
            "release_ru": clean(r[4]), "rocks_ru": clean(r[5]), "faults_ru": clean(r[6]),
            "frequency": frequency(clean(r[8])), "transit_ru": clean(r[9]), "runout_ru": clean(r[10]),
            "distanceToHouses": clean(r[11]), "blockSize": clean(r[12]), "maxVolume": clean(r[13]),
            "area_ha": num(r[14]), "houses": num(r[15]) if num(r[15]) is not None else clean(r[15]),
            "households": num(r[16]), "atRisk_ru": clean(r[17]), "recommendations_ru": clean(r[18]),
        }
        zones.setdefault(code, []).append({k: v for k, v in sub.items() if v not in ("", None)})

    sites = []
    for code in sorted(zones, key=lambda c: int(c[3:])):
        subs = zones[code]
        s = {"id": f"{a.id}-{code}", "name": code,
             "place": " / ".join(dict.fromkeys(x["site"] for x in subs)),
             "place_ru": " / ".join(dict.fromkeys(x["site_ru"] for x in subs)),
             "district": "Khorog", "jamoat": translit(subs[0].get("microdistrict_ru", "")),
             "area_ha": round(sum(x.get("area_ha") or 0 for x in subs), 2),
             "households": max([x.get("households") or 0 for x in subs] + [sum(x["houses"] for x in subs if isinstance(x.get("houses"), (int, float)))]),
             "frequency": subs[0].get("frequency", ""),
             "subsites": subs}
        if code in pos:
            s["lat"], s["lon"], method = pos[code]
            s["approxLocation"] = method
        else:
            s["lat"] = s["lon"] = None
            s["noGps"] = f"{code} is not in {a.positions_csv}"
        sites.append(s)

    dataset = {"id": a.id, "title": a.title, "hazard": "rockfall", "kind": "zone",
               "source": a.xlsx.replace("\\", "/").split("/")[-1], "sites": sites}
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("// Made by tools/rockfall_table_to_js.py — run the script again instead of editing by hand.\n")
        f.write("registerDataset(" + json.dumps(dataset, ensure_ascii=False, indent=1) + ");\n")
    print(f"{len(sites)} rockfall zones ({sum(len(z) for z in zones.values())} table rows). Wrote {a.out}")

if __name__ == "__main__":
    main()
