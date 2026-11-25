"""
Turn lists of damaged houses ("Аварийные дома: разрушение и частичное разрушение") into one map layer.
Counts houses and people per village. Names of residents are NOT copied into the app.

Village positions come from source/village_positions.csv (district_ru, village_ru, lat, lon, source).
Villages that are not in that file are listed in the table as "No GPS"; add a line to the CSV and run again.

Usage (from the project folder):
    pip install openpyxl
    python tools/damage_lists_to_js.py source/damaged_houses/*.xlsx --positions source/village_positions.csv --out data/damaged_houses.js
"""
import argparse, csv, glob, json, re
import openpyxl

LAT = {"а":"a","б":"b","в":"v","г":"g","ғ":"gh","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","ӣ":"i","й":"y",
       "к":"k","қ":"q","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ӯ":"u","ф":"f",
       "х":"kh","ҳ":"h","ц":"ts","ч":"ch","ҷ":"j","ш":"sh","щ":"sh","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"}
DISTRICTS = {"рушан": "Rushan", "шугнан": "Shugnan", "рошткала": "Roshtqala", "ишкашим": "Ishkashim", "вандж": "Vanj", "дарваз": "Darvoz"}
LATIN_LOOKALIKES = str.maketrans("CcAaEeOoPpXxKkMHTB", "СсАаЕеОоРрХхКкМНТВ")   # Latin letters typed by mistake

def clean(v):
    return re.sub(r"\s+", " ", str(v or "")).strip().translate(LATIN_LOOKALIKES)

def translit(s):
    s = clean(s).replace("Дж", "Ҷ").replace("дж", "ҷ")
    return "".join((LAT[c.lower()].capitalize() if c != c.lower() else LAT[c]) if c.lower() in LAT else c for c in s)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", nargs="+"); ap.add_argument("--positions", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--id", default="damaged-houses")
    ap.add_argument("--title", default="Damaged houses (destroyed or partly destroyed)")
    a = ap.parse_args()
    files = [f for pattern in a.xlsx for f in (glob.glob(pattern) or [pattern])]

    pos = {}
    with open(a.positions, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pos[(clean(r["district_ru"]).lower(), clean(r["village_ru"]).lower())] = (float(r["lat"]), float(r["lon"]), r["source"])

    villages = {}
    for path in files:
        ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
        rows = [list(r) + [None] * 10 for r in ws.iter_rows(values_only=True)]
        head = next(i for i, r in enumerate(rows) if any("кишлак" in clean(c).lower() for c in r))
        h = [clean(c).lower() for c in rows[head]]
        col = lambda w: next(k for k, x in enumerate(h) if w in x)
        cn, cd, cj, cv, cp = col("№"), col("район"), col("джамоат"), col("кишлак"), col("колво")
        for r in rows[head + 1:]:
            if not isinstance(r[cn], (int, float)) or not clean(r[cv]): continue
            d, v = clean(r[cd]), clean(r[cv])
            key = (d.lower(), v.lower())
            x = villages.setdefault(key, {"district_ru": d, "village_ru": v, "jamoats": set(), "houses": 0, "people": 0})
            x["jamoats"].add(clean(r[cj])); x["houses"] += 1
            if isinstance(r[cp], (int, float)): x["people"] += int(r[cp])
            # column "Ф.И.О." (resident's name) is deliberately not read

    sites = []
    for key, x in villages.items():
        s = {"id": f"{a.id}-{translit(x['village_ru']).lower()}-{translit(x['district_ru']).lower()}",
             "name": translit(x["village_ru"]), "place": translit(x["village_ru"]), "place_ru": x["village_ru"],
             "district": DISTRICTS.get(x["district_ru"].lower(), translit(x["district_ru"])),
             "jamoat": ", ".join(sorted(translit(j) for j in x["jamoats"] if j)),
             "damagedHouses": x["houses"], "peopleInDamagedHouses": x["people"]}
        if key in pos:
            s["lat"], s["lon"], s["positionSource"] = pos[key]
        else:
            s["lat"] = s["lon"] = None
            s["noGps"] = "Village not in source/village_positions.csv yet"
        sites.append(s)
    sites.sort(key=lambda s: (s["district"], s["name"]))

    dataset = {"id": a.id, "title": a.title, "hazard": "earthquake", "kind": "damage",
               "source": ", ".join(f.replace("\\", "/").split("/")[-1] for f in files), "sites": sites}
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("// Made by tools/damage_lists_to_js.py — run the script again instead of editing by hand.\n")
        f.write("registerDataset(" + json.dumps(dataset, ensure_ascii=False, indent=1) + ");\n")
    on = sum(1 for s in sites if s["lat"] is not None)
    print(f"{len(sites)} villages, {sum(s['damagedHouses'] for s in sites)} houses, {on} villages on the map. Wrote {a.out}")

if __name__ == "__main__":
    main()
