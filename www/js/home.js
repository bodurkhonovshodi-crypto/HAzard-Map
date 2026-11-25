// ============================================================
//  HOME PAGE: the big map, live weather, alerts
// ============================================================

const REFRESH_HOURS = 3;
const state = {
  mode: "live",          // "live" or "manual"
  weather: {},           // section id -> { newSnow, snow3d, rain, tmax }
  results: {},           // section id -> assessWeather() result
  updated: null,
  notified: new Set(),
};
let map, markers, sectionLabels;

DATA_READY.then(start);

function start() {
  initSites();
  const made = makeMap("map");
  map = made.map;
  const drawn = addSites(map, id => state.results[id]);
  markers = drawn.markers;
  const overlayLayers = addOverlays(map);
  const geoLayers = addGeoLayers(map);
  sectionLabels = L.layerGroup().addTo(map);
  L.control.layers(made.base, { ...overlayLayers, ...geoLayers, ...drawn.datasetLayers, "Section labels": sectionLabels }, { collapsed: true }).addTo(map);
  fitAll(map);
  buildOverlayControls(overlayLayers);
  buildRules();
  buildPresets();
  setupTabs();
  setupUserFiles();
  setupNotifications();
  openSiteFromLink();

  $("modeLive").addEventListener("click", () => setMode("live"));
  $("modeManual").addEventListener("click", () => setMode("manual"));
  $("sections").addEventListener("change", e => {
    const t = e.target;
    if (t.tagName !== "INPUT") return;
    state.weather[t.dataset.sec][t.dataset.k] = Number(t.value) || 0;
    evaluate();
  });

  evaluate();
  setMode("live");
  setInterval(() => { if (state.mode === "live") setMode("live"); }, REFRESH_HOURS * 3600 * 1000);
}

// ---------- side panel ----------
function setupTabs() {
  document.querySelectorAll(".tabs [data-tab]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".tabs [data-tab]").forEach(x => x.setAttribute("aria-selected", x === b));
    document.querySelectorAll(".tab").forEach(t => t.hidden = t.id !== "tab-" + b.dataset.tab);
  }));
}

function buildOverlayControls(overlayLayers) {
  const box = $("overlayControls");
  if (!OVERLAYS.length) { box.innerHTML = '<p class="hint">No map images yet.</p>'; return; }
  const legend = new Map();
  for (const o of OVERLAYS) for (const l of o.legend || []) legend.set(l.label, l.color);
  box.innerHTML = OVERLAYS.map((o, i) => `
    <label class="opac"><span>${esc(o.title)}</span>
      <input type="range" min="0" max="100" value="${Math.round((o.opacity ?? 0.85) * 100)}" data-i="${i}" aria-label="Opacity of ${esc(o.title)}">
    </label>`).join("") +
    `<div class="legend-list">${[...legend].map(([label, color]) => `<span><i class="sw" style="background:${esc(color)}"></i>${esc(label)}</span>`).join("")}</div>`;
  box.addEventListener("input", e => {
    const o = OVERLAYS[e.target.dataset.i];
    if (o) overlayLayers[o.title].setOpacity(e.target.value / 100);
  });
}

function buildRules() {
  for (const [k, v] of Object.entries(THRESHOLDS)) {
    const l = document.createElement("label");
    l.innerHTML = `${esc(RULE_LABELS[k] || k)}<input type="number" step="1" value="${v}" data-k="${k}">`;
    $("rulegrid").appendChild(l);
  }
  $("rulegrid").addEventListener("change", e => {
    if (e.target.dataset.k) { THRESHOLDS[e.target.dataset.k] = Number(e.target.value) || 0; evaluate(); }
  });
}

function setupUserFiles() {
  const colors = ["#d14d8b", "#2f8f9d", "#8d6e1f", "#5b4a8a", "#3f7d3a"];
  let n = 0;
  $("userFile").addEventListener("change", async e => {
    for (const file of e.target.files) {
      const li = document.createElement("li");
      try {
        const gj = await readUserFile(file);
        const color = colors[n++ % colors.length];
        const layer = geoLayer(gj, color, file.name).addTo(map);
        const count = (gj.features || [gj]).length;
        li.innerHTML = `<i class="sw" style="background:${color}"></i><span>${esc(file.name)} · ${count} features</span> <button type="button" class="small">Remove</button>`;
        li.querySelector("button").addEventListener("click", () => { map.removeLayer(layer); li.remove(); });
        try { map.fitBounds(layer.getBounds().pad(0.1)); } catch (_) { /* empty layer */ }
      } catch (err) {
        li.innerHTML = `<span class="lostnote">${esc(file.name)}: ${esc(err.message)}</span>`;
      }
      $("userFiles").appendChild(li);
    }
    e.target.value = "";
  });
}

// index.html?site=<id> (used by the Data page) opens that site
function openSiteFromLink() {
  const id = new URLSearchParams(location.search).get("site");
  const s = id && SITES.find(x => x.id === id);
  if (!s || !s.hasLocation) return;
  map.setView([s.lat, s.lon], 13);
  setTimeout(() => markers.get(s.id)?.openPopup(), 300);
}

// ---------- weather ----------
async function loadForecast() {
  const used = usedSections();
  const p = new URLSearchParams({
    latitude: used.map(s => s.lat).join(","),
    longitude: used.map(s => s.lon).join(","),
    elevation: used.map(s => s.forecastAlt_m || "nan").join(","),
    daily: "snowfall_sum,rain_sum,temperature_2m_max",
    past_days: "2", forecast_days: "3", timezone: "Asia/Dushanbe",
  });
  const res = await fetch("https://api.open-meteo.com/v1/forecast?" + p);
  if (!res.ok) throw new Error("Open-Meteo answered " + res.status);
  let data = await res.json();
  if (!Array.isArray(data)) data = [data];
  // daily index: 0 = 2 days ago, 1 = yesterday, 2 = today, 3 = tomorrow, 4 = day after.
  // We look at today and the next 2 days. The 3-day snow total is checked for every 3-day window
  // that ends in those days, so a storm forecast for tomorrow also counts in the 3-day total.
  used.forEach((sec, i) => {
    const d = data[i].daily;
    const snow = d.snowfall_sum.map(v => v || 0), rain = d.rain_sum.map(v => v || 0);
    const tmax = d.temperature_2m_max.map(v => (v == null ? -99 : v));
    const days = [2, 3, 4].filter(j => j < snow.length);
    state.weather[sec.id] = {
      newSnow: round1(Math.max(...days.map(j => snow[j]))),
      snow3d: round1(Math.max(...days.map(j => snow[j] + snow[j - 1] + snow[j - 2]))),
      rain: round1(Math.max(...days.map(j => rain[j]))),
      tmax: round1(Math.max(...days.map(j => tmax[j]))),
    };
  });
  state.updated = new Date();
}

const PRESETS = {
  storm: { label: "Snowstorm", w: { newSnow: 35, snow3d: 55, rain: 0, tmax: -6 } },
  warm:  { label: "Spring warm-up", w: { newSnow: 0, snow3d: 25, rain: 0, tmax: 8 } },
  rain:  { label: "Heavy rain", w: { newSnow: 0, snow3d: 0, rain: 32, tmax: 14 } },
  calm:  { label: "Calm day", w: { newSnow: 0, snow3d: 0, rain: 0, tmax: 6 } },
};
function buildPresets() {
  for (const [k, p] of Object.entries(PRESETS)) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "preset"; b.textContent = p.label;
    b.addEventListener("click", () => applyPreset(k));
    $("presets").appendChild(b);
  }
}
function applyPreset(key) {
  for (const sec of SECTIONS) state.weather[sec.id] = { ...PRESETS[key].w };
  evaluate();
}

async function setMode(mode) {
  state.mode = mode;
  $("modeLive").setAttribute("aria-pressed", mode === "live");
  $("modeManual").setAttribute("aria-pressed", mode === "manual");
  $("presets").hidden = mode !== "manual";
  if (mode === "manual") {
    $("status").textContent = "Test scenario: type any values or pick a preset. These are not real weather.";
    if (!Object.keys(state.weather).length) applyPreset("storm"); else evaluate();
    return;
  }
  $("status").textContent = "Loading forecast from Open-Meteo…";
  try {
    await loadForecast();
    $("status").textContent = `Live forecast from Open-Meteo for today and the next 2 days, updated ${state.updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Temperature is corrected to the altitude where avalanches start; rain and snow come from the model grid and are not.`;
    evaluate();
  } catch (err) {
    console.error(err);
    await setMode("manual");
    $("status").textContent = "Could not load the forecast (no internet, or the service is busy). Showing a test scenario instead. Press “Live forecast” to try again.";
  }
}

// ---------- decide levels and redraw ----------
function evaluate() {
  const month = new Date().getMonth() + 1;
  for (const sec of SECTIONS) {
    const w = state.weather[sec.id];
    state.results[sec.id] = w ? assessWeather({ ...w, month }, hazardsIn(sec.id)) : null;
  }
  colorSites(markers, s => state.results[s.section]?.level);
  drawSectionLabels();
  renderSections();
  renderAlerts();
  renderChips();
}

function drawSectionLabels() {
  sectionLabels.clearLayers();
  for (const sec of usedSections()) {
    const l = state.results[sec.id]?.level ?? 0;
    L.marker([sec.lat, sec.lon], { interactive: false,
      icon: L.divIcon({ className: "sec-label", html: `<span data-l="${l}">${esc(sec.name)}</span>`, iconSize: null }) }).addTo(sectionLabels);
  }
}

function renderSections() {
  const box = $("sections");
  box.innerHTML = "";
  const manual = state.mode === "manual";
  const fields = [["newSnow", "New snow, 1 day", "cm"], ["snow3d", "Snow, 3 days", "cm"], ["rain", "Rain, 1 day", "mm"], ["tmax", "Max temp", "°C"]];
  const list = usedSections().sort((a, b) => (state.results[b.id]?.level ?? 0) - (state.results[a.id]?.level ?? 0));
  for (const sec of list) {
    const r = state.results[sec.id], w = state.weather[sec.id] || {};
    const l = r ? r.level : 0;
    const div = document.createElement("div");
    div.className = "sec"; div.dataset.l = l;
    div.innerHTML = `
      <div class="sec-row">
        <div><button type="button" class="sec-name">${esc(sec.name)}</button><div class="sec-sub">${countText(sec.id)} · forecast at ${sec.forecastAlt_m} m</div></div>
        <span class="pill" data-l="${l}">${LEVEL_NAMES[l]}</span>
      </div>
      <div class="vals">${fields.map(([k, label, unit]) => manual
        ? `<label>${label} (${unit})<input type="number" step="1" id="in-${sec.id}-${k}" data-sec="${sec.id}" data-k="${k}" value="${w[k] ?? 0}"></label>`
        : `<div><span>${label}</span><b>${w[k] ?? "–"} ${unit}</b></div>`).join("")}</div>
      <p class="why">${r && r.reasons.length ? "<b>Why:</b> " + r.reasons.map(esc).join("; ") + "." : "No rule triggered."}</p>`;
    div.querySelector(".sec-name").addEventListener("click", () => {
      const pts = sitesIn(sec.id).filter(s => s.hasLocation).map(s => [s.lat, s.lon]);
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3));
    });
    box.appendChild(div);
  }
}

function renderAlerts() {
  const box = $("alerts");
  const list = SECTIONS.filter(s => state.results[s.id]?.level > 0)
    .sort((a, b) => state.results[b.id].level - state.results[a.id].level);
  $("alertCount").textContent = list.length ? list.length : "";
  if (!list.length) { box.innerHTML = '<p class="empty">No alerts. All sections are normal.</p>'; return; }
  box.innerHTML = list.map(sec => {
    const r = state.results[sec.id];
    const msg = alertMessage(sec, r, countsIn(sec.id));
    return `<div class="msg" data-l="${r.level}"><div class="from"><span>Pamir Hazard Watch</span><span>${state.mode === "live" ? "live" : "test"}</span></div><div class="t">${esc(msg.title)}</div><div>${esc(msg.body)}</div></div>`;
  }).join("");
  if (state.mode === "live" && "Notification" in window && Notification.permission === "granted") {
    // A valley that drops below Warning can alert again the next time it reaches Warning.
    for (const sec of SECTIONS) if ((state.results[sec.id]?.level ?? 0) < 2) state.notified.delete(sec.id);
    for (const sec of list) {
      const r = state.results[sec.id];
      if (r.level < 2 || state.notified.has(sec.id)) continue;
      const msg = alertMessage(sec, r, countsIn(sec.id));
      new Notification(msg.title, { body: msg.body });
      state.notified.add(sec.id);
    }
  }
}

function renderChips() {
  const onMap = SITES.filter(s => s.hasLocation).length;
  const warn = SECTIONS.filter(s => state.results[s.id]?.level === 2).length;
  const watch = SECTIONS.filter(s => state.results[s.id]?.level === 1).length;
  $("chips").innerHTML = `
    <span class="chip"><b>${onMap}</b> places on the map</span>
    <span class="chip lvl2"><b>${warn}</b> warning</span>
    <span class="chip lvl1"><b>${watch}</b> watch</span>`;
}

function setupNotifications() {
  const nb = $("notifyBtn");
  if (!("Notification" in window)) { nb.hidden = true; return; }
  const label = () => nb.textContent = Notification.permission === "granted" ? "Desktop alerts on" : Notification.permission === "denied" ? "Desktop alerts blocked" : "Turn on desktop alerts";
  label();
  nb.addEventListener("click", async () => { await Notification.requestPermission(); label(); state.notified.clear(); renderAlerts(); });
}
