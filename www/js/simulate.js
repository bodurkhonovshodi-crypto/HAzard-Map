// ============================================================
//  SIMULATION PAGE: "what if a 1-in-25-year storm hits?"
//
//  1. Downloads 30 years of daily weather (ERA5, 1991–2020) for every valley.
//  2. Finds the biggest day of rain / snow in each year (annual maximum).
//  3. Fits a Gumbel distribution to those maxima, so we can say how big
//     a storm that comes "once in T years" is (the return level).
//  4. Runs the same warning rules as the Map page (js/rules.js) on that storm.
// ============================================================

const RETURN_PERIODS = [2, 5, 10, 25, 50, 100];
const CLIMATE_YEARS = [1991, 2020];
// The saved climate data is tied to each valley's position and altitude in data/sections.js,
// so changing a section there makes the page download fresh statistics.
const CACHE_PREFIX = "phw-climate-v2:";
const cacheKey = () => CACHE_PREFIX + usedSections().map(s => `${s.id}@${s.lat},${s.lon},${s.forecastAlt_m}`).join("|");

const sim = {
  mode: "prob",          // "prob" (by how often) or "own" (my own numbers)
  event: "rain",         // "rain", "snow", "rainOnSnow"
  T: 25,                 // return period in years
  climate: null,         // section id -> { rain: [annual max…], snow1: […], snow3: […] }
  fits: {},              // section id -> { rain: {mu, beta}, snow1: …, snow3: … }
  results: {},           // section id -> assessWeather() result
  weather: {},           // section id -> storm used
};
let map, markers, valleyLayer;

DATA_READY.then(start);

function start() {
  initSites();
  const made = makeMap("map");
  map = made.map;
  const drawn = addSites(map, id => sim.results[id]);
  markers = drawn.markers;
  const overlays = addOverlays(map);
  for (const l of Object.values(overlays)) map.removeLayer(l);       // keep the map clean; switch them on in the layer list
  L.control.layers(made.base, { ...overlays, ...drawn.datasetLayers }, { collapsed: true }).addTo(map);
  fitAll(map);
  valleyLayer = L.layerGroup().addTo(map);

  for (const sec of usedSections()) $("area").add(new Option(sec.name, sec.id));
  $("rp").innerHTML = RETURN_PERIODS.map(t => `<button type="button" data-t="${t}" aria-pressed="${t === sim.T}">${t} yr</button>`).join("");

  $("rp").addEventListener("click", e => { const t = e.target.dataset.t; if (!t) return; sim.T = +t;
    $("rp").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === t)); run(); });
  document.querySelectorAll("[data-ev]").forEach(b => b.addEventListener("click", () => {
    sim.event = b.dataset.ev;
    document.querySelectorAll("[data-ev]").forEach(x => x.setAttribute("aria-selected", x === b));
    setDefaultsForEvent(); run();
  }));
  $("modeProb").addEventListener("click", () => setMode("prob"));
  $("modeOwn").addEventListener("click", () => setMode("own"));
  ["sRain", "sSnow", "sSnow3", "sTemp"].forEach(id => $(id).addEventListener("input", run));
  $("month").addEventListener("change", run);
  $("area").addEventListener("change", () => {
    const id = $("area").value;
    const pts = (id ? sitesIn(id) : SITES).filter(s => s.hasLocation).map(s => [s.lat, s.lon]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15));
    run();
  });

  setDefaultsForEvent();
  loadClimate();
}

function setDefaultsForEvent() {
  const d = { rain: { month: 7, temp: 14 }, snow: { month: 2, temp: -6 }, rainOnSnow: { month: 4, temp: 4 } }[sim.event];
  $("month").value = d.month; $("sTemp").value = d.temp;
  if (sim.mode === "own") {
    $("sRain").value = sim.event === "snow" ? 0 : 30;
    $("sSnow").value = sim.event === "rain" ? 0 : 30;
    $("sSnow3").value = sim.event === "rain" ? 0 : 50;
  }
}

function setMode(mode) {
  if (mode === "prob" && !sim.climate) { $("climStatus").textContent = "The 30-year weather could not be loaded, so only “My own numbers” works right now."; return; }
  sim.mode = mode;
  $("modeProb").setAttribute("aria-pressed", mode === "prob");
  $("modeOwn").setAttribute("aria-pressed", mode === "own");
  $("probBox").hidden = mode !== "prob";
  $("ownBox").hidden = mode !== "own";
  setDefaultsForEvent();
  run();
}

// ---------- climate statistics ----------
async function loadClimate() {
  const used = usedSections();
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()) || "null");
    if (cached && used.every(s => cached[s.id])) { sim.climate = cached; }
  } catch (_) { /* storage not available */ }

  if (!sim.climate) {
    try {
      const p = new URLSearchParams({
        latitude: used.map(s => s.lat).join(","), longitude: used.map(s => s.lon).join(","),
        elevation: used.map(s => s.forecastAlt_m || "nan").join(","),
        start_date: `${CLIMATE_YEARS[0]}-01-01`, end_date: `${CLIMATE_YEARS[1]}-12-31`,
        daily: "rain_sum,snowfall_sum", timezone: "Asia/Dushanbe",
      });
      const res = await fetch("https://archive-api.open-meteo.com/v1/archive?" + p);
      if (!res.ok) throw new Error("Open-Meteo answered " + res.status);
      let data = await res.json();
      if (!Array.isArray(data)) data = [data];
      sim.climate = {};
      used.forEach((sec, i) => { sim.climate[sec.id] = annualMaxima(data[i].daily); });
      try {
        for (let k = localStorage.length - 1; k >= 0; k--) {          // drop older copies
          const key = localStorage.key(k);
          if (key && (key.startsWith(CACHE_PREFIX) || key === "phw-climate-v1")) localStorage.removeItem(key);
        }
        localStorage.setItem(cacheKey(), JSON.stringify(sim.climate));
      } catch (_) { /* storage full or blocked: fine */ }
    } catch (err) {
      console.error(err);
      $("climStatus").textContent = "Could not load 30 years of weather (needs internet). Showing “My own numbers” instead.";
      setMode("own");
      $("climTable").innerHTML = '<p class="empty">No climate data loaded.</p>';
      return;
    }
  }
  for (const [id, c] of Object.entries(sim.climate)) {
    sim.fits[id] = { rain: gumbelFit(c.rain), snow1: gumbelFit(c.snow1), snow3: gumbelFit(c.snow3) };
  }
  $("climStatus").textContent = `Storm sizes come from ${CLIMATE_YEARS[0]}–${CLIMATE_YEARS[1]} daily weather (ERA5) for each valley.`;
  run();
}

/** biggest 1-day rain, 1-day snow and 3-day snow of every year */
function annualMaxima(d) {
  const years = {};
  const n = d.time.length;
  for (let i = 0; i < n; i++) {
    const y = d.time[i].slice(0, 4);
    const r = years[y] || (years[y] = { rain: 0, snow1: 0, snow3: 0 });
    const rain = d.rain_sum[i] || 0, snow = d.snowfall_sum[i] || 0;
    const snow3 = snow + (d.snowfall_sum[i - 1] || 0) + (d.snowfall_sum[i - 2] || 0);
    r.rain = Math.max(r.rain, rain); r.snow1 = Math.max(r.snow1, snow); r.snow3 = Math.max(r.snow3, snow3);
  }
  const ys = Object.values(years);
  return { rain: ys.map(y => round1(y.rain)), snow1: ys.map(y => round1(y.snow1)), snow3: ys.map(y => round1(y.snow3)) };
}

/** Gumbel distribution fitted by the method of moments */
function gumbelFit(xs) {
  const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const beta = sd * Math.sqrt(6) / Math.PI;
  return { mu: mean - 0.5772 * beta, beta, n, max: Math.max(...xs) };
}
/** the value reached on average once every T years */
const returnLevel = (fit, T) => Math.max(0, fit.mu - fit.beta * Math.log(-Math.log(1 - 1 / T)));
const pct = p => (p * 100 < 1 ? (p * 100).toFixed(1) : Math.round(p * 100)) + "%";

// ---------- run the scenario ----------
function stormFor(secId) {
  const temp = +$("sTemp").value;
  if (sim.mode === "own") return { rain: +$("sRain").value, newSnow: +$("sSnow").value, snow3d: +$("sSnow3").value, tmax: temp };
  const f = sim.fits[secId];
  if (!f) return null;
  const T = sim.T;
  if (sim.event === "rain") return { rain: round1(returnLevel(f.rain, T)), newSnow: 0, snow3d: 0, tmax: temp };
  if (sim.event === "snow") return { rain: 0, newSnow: round1(returnLevel(f.snow1, T)), snow3d: round1(returnLevel(f.snow3, T)), tmax: temp };
  // rain of this return period falling on an ordinary winter snowpack (the 2-year 3-day snowfall)
  return { rain: round1(returnLevel(f.rain, T)), newSnow: 0, snow3d: round1(returnLevel(f.snow3, 2)), tmax: temp };
}

function siteLevel(s) {
  const r = sim.results[s.section];
  if (!r || !showsWeather(s)) return 0;
  return r.kinds.has(s.hazard) ? r.level : 0;
}

function siteScore(s) {
  const l = siteLevel(s);
  if (!l) return 0;
  const hh = typeof s.households === "number" ? s.households : 0;
  const vol = typeof s.volume_m3 === "number" ? s.volume_m3 : 0;
  return l * 10 + 3 * Math.log10(1 + hh) + (vol ? Math.log10(vol) / 2 : 0) + (/high/i.test(s.attrs?.Intensity || "") ? 2 : 0);
}

function run() {
  ["sRain", "sSnow", "sSnow3", "sTemp"].forEach(id => { const o = document.querySelector(`output[for="${id}"]`); if (o) o.textContent = $(id).value; });
  const month = +$("month").value, area = $("area").value;
  sim.results = {}; sim.weather = {};
  for (const sec of usedSections()) {
    if (area && sec.id !== area) continue;
    const w = stormFor(sec.id);
    if (!w) continue;
    sim.weather[sec.id] = w;
    sim.results[sec.id] = assessWeather({ ...w, month }, hazardsIn(sec.id));
  }
  colorSites(markers, siteLevel);
  drawValleys();
  renderChance();
  renderSummary();
  renderSections();
  renderRank();
  renderClimateTable();
}

// Each valley as a soft coloured circle with its name: shows mudflow and flood risk for the whole valley
function drawValleys() {
  valleyLayer.clearLayers();
  for (const [id, r] of Object.entries(sim.results)) {
    const sec = sectionById(id), c = COLORS[r.level];
    L.circle([sec.lat, sec.lon], { pane: "vectors", radius: 12000, color: c, weight: r.level ? 2 : 1, dashArray: r.level ? null : "4 4",
      fillColor: c, fillOpacity: r.level ? 0.18 : 0.04, interactive: false }).addTo(valleyLayer);
    L.marker([sec.lat, sec.lon], { interactive: false,
      icon: L.divIcon({ className: "sec-label", html: `<span data-l="${r.level}">${esc(sec.name)}</span>`, iconSize: null }) }).addTo(valleyLayer);
  }
}

function renderChance() {
  if (sim.mode !== "prob") return;
  const p = 1 / sim.T;
  const inN = n => 1 - (1 - p) ** n;
  const what = { rain: "rainstorm", snow: "snowstorm", rainOnSnow: "rainstorm on a normal winter snowpack" }[sim.event];
  $("chance").innerHTML = `A <b>1-in-${sim.T}-year</b> ${what} has a <b>${pct(p)}</b> chance of happening in any one year,
    <b>${pct(inN(10))}</b> in the next 10 years and <b>${pct(inN(30))}</b> in 30 years.`;
}

function renderSummary() {
  const res = Object.values(sim.results);
  $("nWarn").textContent = res.filter(r => r.level === 2).length;
  $("nWatch").textContent = res.filter(r => r.level === 1).length;
  const active = SITES.filter(s => siteLevel(s) > 0);
  $("nSites").textContent = active.length;
  const hh = active.reduce((a, s) => a + (typeof s.households === "number" ? s.households : 0), 0);
  const zones = active.filter(s => s.hazard === "rockfall").length;
  const parts = [];
  if (hh) parts.push(`About ${fmtNum(hh)} households live in the danger zones of these sites (from the households columns in your data; some may be counted twice).`);
  if (zones) parts.push(`${zones} of the active sites are Khorog rockfall zones.`);
  const valleys = Object.values(sim.results).filter(r => r.level > 0 && r.kinds.has("mudflow")).length;
  if (valleys) parts.push(`${valleys} ${valleys === 1 ? "valley gets" : "valleys get"} mudflow risk: villages on stream fans are in danger there.`);
  $("exposure").textContent = active.length || valleys ? parts.join(" ") || `${active.length} hazard sites are set off by this storm.` : "No hazard site is triggered by this storm.";
}

function renderSections() {
  const fields = [["rain", "Rain, 1 day", "mm"], ["newSnow", "New snow", "cm"], ["snow3d", "Snow, 3 days", "cm"], ["tmax", "Max temp", "°C"]];
  const ids = Object.keys(sim.results).sort((a, b) => sim.results[b].level - sim.results[a].level);
  $("sections").innerHTML = ids.map(id => {
    const sec = sectionById(id), r = sim.results[id], w = sim.weather[id];
    return `<div class="sec" data-l="${r.level}">
      <div class="sec-row"><div><button type="button" class="sec-name" data-zoom="${id}">${esc(sec.name)}</button><div class="sec-sub">${countText(id)}</div></div>
        <span class="pill" data-l="${r.level}">${LEVEL_NAMES[r.level]}</span></div>
      <div class="vals">${fields.map(([k, l, u]) => `<div><span>${l}</span><b>${w[k]} ${u}</b></div>`).join("")}</div>
      <p class="why">${r.reasons.length ? "<b>Why:</b> " + r.reasons.map(esc).join("; ") + "." : "No rule triggered."}</p>
    </div>`;
  }).join("") || '<p class="empty">Waiting for the weather statistics…</p>';
  $("sections").querySelectorAll("[data-zoom]").forEach(b => b.addEventListener("click", () => {
    const pts = sitesIn(b.dataset.zoom).filter(s => s.hasLocation).map(s => [s.lat, s.lon]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3));
  }));
}

function renderRank() {
  const top = SITES.filter(s => s.hasLocation && siteScore(s) > 0).sort((a, b) => siteScore(b) - siteScore(a)).slice(0, 12);
  $("rank").innerHTML = top.map(s => {
    const l = siteLevel(s);
    const extra = [s.households ? s.households + " households" : "", s.volume_m3 ? fmtNum(s.volume_m3) + " m³" : "", s.attrs?.Intensity ? s.attrs.Intensity.toLowerCase() + " intensity" : ""].filter(Boolean).join(" · ");
    return `<li data-id="${esc(s.id)}"><span class="dot" style="background:${COLORS[l]}"></span>
      <span>${esc(s.name)}${s.place && !s.name.includes(s.place) ? " · " + esc(s.place) : ""}<br><small>${esc(datasetLabel(s.dataset))}${extra ? " · " + esc(extra) : ""}</small></span>
      <span class="pill" data-l="${l}">${LEVEL_NAMES[l]}</span></li>`;
  }).join("") || '<li class="empty">Nothing is triggered.</li>';
  $("rank").querySelectorAll("li[data-id]").forEach(li => li.addEventListener("click", () => {
    const s = SITES.find(x => x.id === li.dataset.id);
    map.setView([s.lat, s.lon], 13);
    markers.get(s.id)?.openPopup();
  }));
}

function renderClimateTable() {
  const id = $("area").value || (sim.fits.khg ? "khg" : Object.keys(sim.fits)[0]);
  const f = sim.fits[id];
  if (!f) return;
  $("climTitle").textContent = `How big storms get: ${sectionById(id).name}`;
  const row = (label, fit, unit) => `<tr><td>${label}</td>${RETURN_PERIODS.map(T => `<td class="num">${Math.round(returnLevel(fit, T))}</td>`).join("")}<td class="num">${Math.round(fit.max)}</td></tr>`;
  $("climTable").innerHTML = `<table class="rl-table"><thead><tr><th>Once in …</th>${RETURN_PERIODS.map(T => `<th>${T} yr</th>`).join("")}<th>Max seen</th></tr></thead><tbody>
    ${row("Rain, 1 day (mm)", f.rain)}${row("New snow, 1 day (cm)", f.snow1)}${row("Snow, 3 days (cm)", f.snow3)}</tbody></table>`;
}
