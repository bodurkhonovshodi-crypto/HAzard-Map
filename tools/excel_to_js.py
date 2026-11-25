"""
Convert a GBAO avalanche database (Excel, same layout as
Avalanch_Rushan_Vanj_Darvoz.xlsx) into a data file the app can load.

Usage (from the project folder):
    pip install openpyxl
    python tools/excel_to_js.py "Avalanch_Rushan_Vanj_Darvoz.xlsx" data/village_database_2017.js --id village-db-2017 --title "Avalanche database 2017 (Rushan, Vanj, Darvoz)"

Then add the new file to js/data-files.js:
    "data/village_database_2017.js",

The table must keep the same column order as the original:
  A No | B District | C Jamoat | D Village | E Date | F Hazard type | G GPS "lat, lon" | H Count |
  I Wet | J Dry | K Volume m3 | L Path m | M Area m2 | N Slope | O Release alt | P Runout alt |
  Q Drop | R Every year | S Once in several years | T Winter | U Spring | V Households |
  W Social objects | X Infrastructure | Y Protection | Z Recommendations | AA Notes
"""
import argparse, json, math, re, sys
import openpyxl

# Rows you checked by hand and know are wrong, per file. Key = row number (column "№") or avalanche number.
# They stay in the table but are not drawn on the map.
SUSPECT_ROWS = {
    "Avalanch_Rushan_Vanj_Darvoz.xlsx": {
        37: "Latitude 37.09 is about 100 km south of the Shipad road. Maybe 38.09?",
        80: "Same village as No. 79 (Poi Mazor) but about 45 km away.",
    },
}

LAT = {"а":"a","б":"b","в":"v","г":"g","ғ":"gh","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","ӣ":"i","й":"y",
       "к":"k","қ":"q","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ӯ":"u","ф":"f",
       "х":"kh","ҳ":"h","ц":"ts","ч":"ch","ҷ":"j","ш":"sh","щ":"sh","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"}
DISTRICTS = {"рушан":"Rushan","вандж":"Vanj","дарваз":"Darvoz","дарвоз":"Darvoz","шугнан":"Shugnan","рошткала":"Roshtqala",
             "ишкашим":"Ishkashim","мургаб":"Murghob","хорог":"Khorog"}

def translit(s):
    if s is None: return ""
    s = str(s).strip()
    s = re.sub(r"(?i)^автодорога\s*", "Road ", s)
    s = s.replace("Дж", "Ҷ").replace("дж", "ҷ")   # Russian "дж" is Tajik "ҷ" → j
    s = re.sub(r"(?i)развилка\s*", "fork of ", s)
    s = re.sub(r"\s*[-_–]\s*", "–", s)
    out = []
    for ch in s:
        low = ch.lower()
        if low in LAT:
            t = LAT[low]
            out.append(t.capitalize() if ch != low and t else t)
        else:
            out.append(ch)
    s = re.sub(r"\s+", " ", "".join(out)).strip()
    return s[:1].upper() + s[1:]

def num(v):
    """'360000..' -> 360000, '200-600' -> '200-600', None -> None"""
    if v is None: return None
    if isinstance(v, (int, float)): return v
    s = str(v).strip().rstrip(".…").replace(",", ".")
    try:
        f = float(s); return int(f) if f.is_integer() else f
    except ValueError:
        return s or None

def text(v):
    if v is None: return ""
    return re.sub(r"\s+", " ", str(v)).strip(" ,.")

def parse_gps(v):
    """'37.565268, 71.350759' or 'X37.511884 Y71.594282' -> (lat, lon, fix-note)"""
    if v is None: return None, None, None
    parts = re.findall(r"\d+(?:[.,]\d+)?", str(v))
    if len(parts) != 2: return None, None, None
    lat, lon = (float(p.replace(",", ".")) for p in parts)
    fix = None
    if lon > 1000:   # e.g. 7040359 -> 70.40359 (decimal point missing)
        digits = parts[1].replace(".", "")
        lon = float(digits[:2] + "." + digits[2:]); fix = f"Longitude typo fixed ({parts[1]} → {lon})"
    if lat > 60 and lon < 60: lat, lon = lon, lat     # columns swapped
    return lat, lon, fix

def frequency(every_year, several):
    vals = []
    for v in (every_year, several):
        s = text(v)
        m = re.match(r"1\s*/\s*(\d+)", s)
        if m:
            n = int(m.group(1)); vals.append("every year" if n == 1 else f"once in {n} years")
    return ", ".join(dict.fromkeys(vals))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx"); ap.add_argument("out")
    ap.add_argument("--id", default="village-db"); ap.add_argument("--title", default="Avalanche database")
    ap.add_argument("--first-row", type=int, default=1, help="row to start reading from (default 1)")
    a = ap.parse_args()

    ws = openpyxl.load_workbook(a.xlsx, data_only=True).worksheets[0]
    all_rows = [list(r) + [None] * 40 for r in ws.iter_rows(min_row=a.first_row, values_only=True)]

    # Find the header row (the one with "Район" and "Кишлак") and the sub-header row under it
    hi = next(i for i, r in enumerate(all_rows) if any(text(c).lower() == "район" for c in r) and any("кишлак" in text(c).lower() for c in r))
    head = [text(c).lower() for c in all_rows[hi]]
    sub = [" ".join(text(c).lower() for c in all_rows[j][k:k + 1]) for k in range(len(head)) for j in [hi + 1]]
    subs = [" ".join(text(all_rows[j][k]).lower() for j in range(hi + 1, min(hi + 4, len(all_rows)))) for k in range(len(head))]
    def col(words, row=head, exact=False):
        for k, h in enumerate(row):
            if any((h == w) if exact else (w in h) for w in words): return k
        return None
    C = {
        "no": col(["№"]), "district": col(["район"], exact=True), "jamoat": col(["джамоат"]), "village": col(["кишлак"]),
        "date": col(["дата"]), "hh": col(["количество хозяйств"]), "pop": col(["количество населения"]),
        "threat": col(["тип угрозы"]), "gps": col(["координат", "gps"]),
        "wet": col(["мокрый"], subs), "dry": col(["сухой"], subs),
        "volume": col(["объем", "объём"]), "path": col(["путь транзита"]), "area": col(["площадь"]),
        "slope": col(["уголь наклона", "угол наклона"]), "release": col(["точки отрыва"]), "runout": col(["зоны остановки"]),
        "drop": col(["высота склона"]), "every": col(["ежегодный"], subs), "several": col(["раз за несколько"], subs),
        "winter": col(["зимой"], subs), "spring": col(["весной"], subs),
        "hh_risk": col(["попадающих"], subs), "social": col(["социальные объекты"], subs), "infra": col(["инфраструктура/", "прочие"], subs),
        "protection": col(["противолавинных"]), "recommend": col(["рекомендации"]), "note": col(["примечание"]),
    }
    get = lambda r, k: r[C[k]] if C.get(k) is not None else None
    suspect = SUSPECT_ROWS.get(a.xlsx.replace("\\", "/").split("/")[-1], {})

    sites, skipped = [], 0
    ctx = {"district": None, "jamoat": None, "village": None, "date": None, "hh": None, "pop": None}
    for r in all_rows[hi + 1:]:
        for k in ctx:                                   # merged cells: carry the last value down
            if text(get(r, k)): ctx[k] = get(r, k)
        threat = text(get(r, "threat"))
        no = get(r, "no")
        m = re.search(r"(\d+)", threat) if threat else None
        if isinstance(no, (int, float)):               # layout 1: one numbered row per avalanche
            no = int(no)
        elif m and "база" not in threat.lower():        # layout 2: rows "Лавина 01", "Лавина 02" …
            no = int(m.group(1))
        else:
            if threat and "база" in threat.lower(): skipped += 1   # village row without its own avalanche data
            continue
        lat, lon, fix = parse_gps(get(r, "gps"))
        kind = " and ".join(k for k, v in (("wet", get(r, "wet")), ("dry", get(r, "dry"))) if text(v))
        season = " and ".join(k for k, v in (("winter", get(r, "winter")), ("spring", get(r, "spring"))) if text(v))
        prot = text(get(r, "protection"))
        infra = "; ".join(x for x in (text(get(r, "infra")), text(get(r, "social")) if C["infra"] is None else "") if x)
        s = {
            "id": f"{a.id}-{no}", "name": f"No. {no}",
            "place": translit(ctx["village"]), "place_ru": text(ctx["village"]),
            "district": DISTRICTS.get(text(ctx["district"]).lower(), translit(ctx["district"])), "jamoat": translit(ctx["jamoat"]),
            "lat": lat, "lon": lon, "date": text(ctx["date"]),
            "avalancheType": kind, "volume_m3": num(get(r, "volume")), "path_m": num(get(r, "path")), "area_m2": num(get(r, "area")),
            "slope": text(get(r, "slope")), "releaseAlt_m": num(get(r, "release")), "runoutAlt_m": num(get(r, "runout")), "drop_m": num(get(r, "drop")),
            "frequency": frequency(get(r, "every"), get(r, "several")), "season": season,
            "households": num(get(r, "hh_risk")), "socialObjects": text(get(r, "social")) if C["infra"] is not None else "",
            "infrastructure_ru": infra,
            "protection": "none" if prot.lower() == "нет" else prot,
            "recommendations_ru": text(get(r, "recommend")), "note": text(get(r, "note")),
        }
        if fix: s["fixed"] = fix
        if no in suspect: s["check"] = suspect[no]
        sites.append(s)
    if skipped:
        print(f"Skipped {skipped} village rows marked 'база' (no coordinates or data of their own).")

    # Placeholder coordinates: 3 or more rows almost at the same point (within ~20 m)
    for s in sites:
        if s["lat"] is None: continue
        near = [t for t in sites if t["lat"] is not None
                and abs(t["lat"] - s["lat"]) < 0.0002 and abs(t["lon"] - s["lon"]) < 0.0002]
        if len(near) >= 3:
            s["noGps"] = "Placeholder coordinates in the table (same point repeated)"
    for s in sites:
        if s["lat"] is None and "noGps" not in s:
            s["noGps"] = "No GPS in the table"
        if s.get("noGps") or s.get("check"):
            s["lat_table"], s["lon_table"] = s["lat"], s["lon"]
            s["lat"] = s["lon"] = None
        for k in [k for k, v in s.items() if v in ("", None) and k not in ("lat", "lon")]:
            del s[k]

    dataset = {"id": a.id, "title": a.title, "hazard": "avalanche", "kind": "village", "source": a.xlsx.split("/")[-1], "sites": sites}
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("// Made by tools/excel_to_js.py — run the script again instead of editing by hand.\n")
        f.write("registerDataset(" + json.dumps(dataset, ensure_ascii=False, indent=1) + ");\n")
    mapped = sum(1 for s in sites if s["lat"] is not None)
    print(f"{len(sites)} rows → {mapped} on the map, {len(sites) - mapped} without usable coordinates. Wrote {a.out}")

if __name__ == "__main__":
    main()
