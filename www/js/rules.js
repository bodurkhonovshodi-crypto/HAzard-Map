// ============================================================
//  WARNING RULES
//  Change the numbers here to tune when the app says Watch or Warning.
//  Levels: 0 = Normal, 1 = Watch, 2 = Warning
// ============================================================

const THRESHOLDS = {
  newSnowWatch_cm: 15,     // new snow in one day
  newSnowWarning_cm: 30,
  snow3dWatch_cm: 25,      // snow over the last 3 days
  snow3dWarning_cm: 50,
  warmAfterSnow_cm: 20,    // this much fresh snow ...
  warmDay_C: 5,            // ... then a day this warm = wet-snow avalanches
  rainOnSnow_mm: 5,        // rain on top of fresh snow (at least 10 cm in 3 days)
  rainWatch_mm: 15,        // rain in one day: mudflow and rockfall risk. Rain above 15–20 mm a day starts mudflows
                           // in dry mountains (Perov 2012, quoted in the OSCE report "Опасные природные явления в Таджикистане", 2018)
  rainWarning_mm: 30,
  meltSnow_cm: 10,         // snow on the slopes + warm day = meltwater loosens rock
  hotDay_C: 18,            // June–August: this warm at the forecast altitude = fast snow and glacier melt.
                           // Most big GBAO mudflows in the atlas (map 155) came from glacier melt in summer,
                           // and Barsem 2015 followed a very hot summer plus rain (OSCE 2018).
  hotRain_mm: 10,          // ... plus this much rain = mudflow warning
};

const RULE_LABELS = {
  newSnowWatch_cm: "New snow in 1 day for Watch (cm)",
  newSnowWarning_cm: "New snow in 1 day for Warning (cm)",
  snow3dWatch_cm: "Snow over 3 days for Watch (cm)",
  snow3dWarning_cm: "Snow over 3 days for Warning (cm)",
  warmAfterSnow_cm: "Fresh snow before a warm day (cm)",
  warmDay_C: "Warm day temperature (°C)",
  rainOnSnow_mm: "Rain on fresh snow (mm)",
  rainWatch_mm: "Rain in 1 day for Watch (mm)",
  rainWarning_mm: "Rain in 1 day for Warning (mm)",
  meltSnow_cm: "Snow that melts and loosens rock (cm)",
  hotDay_C: "Hot summer day at forecast altitude (°C)",
  hotRain_mm: "Rain on a hot summer day for Warning (mm)",
};

/**
 * w       = { newSnow, snow3d, rain, tmax, month }  (cm, cm, mm, °C, 1–12)
 * hazards = Set of hazard types that exist in this area, e.g. {"avalanche", "rockfall"}
 * returns { level, reasons: [text], kinds: Set("avalanche" | "rockfall" | "mudflow") }
 */
function assessWeather(w, hazards = new Set(["avalanche"])) {
  const T = THRESHOLDS;
  let level = 0;
  const reasons = [];
  const kinds = new Set();
  function add(l, text, kind) {
    reasons.push({ l, text });
    kinds.add(kind);
    level = Math.max(level, l);
  }

  if (hazards.has("avalanche")) {
    if (w.newSnow >= T.newSnowWarning_cm) add(2, `${w.newSnow} cm new snow in one day`, "avalanche");
    else if (w.newSnow >= T.newSnowWatch_cm) add(1, `${w.newSnow} cm new snow in one day`, "avalanche");

    if (w.snow3d >= T.snow3dWarning_cm) add(2, `${w.snow3d} cm snow over 3 days`, "avalanche");
    else if (w.snow3d >= T.snow3dWatch_cm) add(1, `${w.snow3d} cm snow over 3 days`, "avalanche");

    if (w.snow3d >= T.warmAfterSnow_cm && w.tmax >= T.warmDay_C)
      add(2, `warm day (${w.tmax} °C) after ${w.snow3d} cm fresh snow: wet-snow avalanches`, "avalanche");

    if (w.rain >= T.rainOnSnow_mm && w.snow3d >= 10)
      add(2, `rain (${w.rain} mm) on fresh snow`, "avalanche");
  }

  // Rockfall: heavy rain and snowmelt water get into cracks and loosen blocks.
  // (Earthquakes also trigger rockfall, but they cannot be forecast.)
  if (hazards.has("rockfall")) {
    if (w.rain >= T.rainWarning_mm) add(2, `${w.rain} mm rain in one day: high rockfall risk`, "rockfall");
    else if (w.rain >= T.rainWatch_mm) add(1, `${w.rain} mm rain in one day: rockfall risk`, "rockfall");
    if (w.snow3d >= T.meltSnow_cm && w.tmax >= T.warmDay_C)
      add(1, `snow melting on the slopes (${w.tmax} °C): rockfall risk`, "rockfall");
  }

  if (w.rain >= T.rainWarning_mm) add(2, `${w.rain} mm rain in one day: mudflow and flood risk`, "mudflow");
  else if (w.rain >= T.rainWatch_mm) add(1, `${w.rain} mm rain in one day: mudflow risk`, "mudflow");

  // Summer heat: fast glacier and snow melt fills streams and glacier lakes
  if (w.month >= 6 && w.month <= 8 && w.tmax >= T.hotDay_C) {
    if (w.rain >= T.hotRain_mm) add(2, `hot day (${w.tmax} °C) with ${w.rain} mm rain: glacier-melt mudflow risk`, "mudflow");
    else add(1, `hot day (${w.tmax} °C): fast glacier melt, mudflow risk in side valleys`, "mudflow");
  }

  reasons.sort((a, b) => b.l - a.l);
  return { level, reasons: reasons.map(r => r.text), kinds };
}

const ACTIONS = {
  avalanche: ["Avoid travel on this road. If you must go, do not stop under slopes and follow road service instructions.",
              "Travel with care and check for updates before leaving."],
  rockfall:  ["Stay away from the foot of steep rocky slopes in the marked zones. Do not stand, park or play below cliffs. Be ready to leave if local authorities say so.",
              "Watch for falling stones below rocky slopes and keep children away from the zones on the map."],
  mudflow:   ["Stay away from riverbeds and side gullies. Do not cross fast, muddy streams.",
              "Watch side gullies and rivers. Be ready to move to higher ground."],
};
const KIND_NAMES = { avalanche: "Avalanche", rockfall: "Rockfall", mudflow: "Mudflow" };

/** The text people would receive on their phone. counts = { avalanche: n, rockfall: n } */
function alertMessage(section, result, counts) {
  const kinds = ["avalanche", "rockfall", "mudflow"].filter(k => result.kinds.has(k));
  const names = kinds.map((k, i) => i ? KIND_NAMES[k].toLowerCase() : KIND_NAMES[k]);
  const what = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0];
  const level = result.level === 2 ? "warning" : "watch";
  const known = [];
  if (counts.avalanche) known.push(`${counts.avalanche} known avalanche sites`);
  if (counts.rockfall) known.push(`${counts.rockfall} rockfall zones`);
  const actions = kinds.slice(0, 2).map(k => ACTIONS[k][result.level === 2 ? 0 : 1]);
  return {
    title: `${what} ${level}: ${section.name}`,
    body: `${known.join(" and ")} in this area. ${actions.join(" ")}`,
  };
}
