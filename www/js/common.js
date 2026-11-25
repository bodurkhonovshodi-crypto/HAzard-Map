// ============================================================
//  PAMIR HAZARD WATCH — shared code used by every page
//  (sites, popups, map layers, downloads, opening your own files)
// ============================================================

const COLORS = ["#4d7a4a", "#b97a1c", "#b8432c"];   // Normal, Watch, Warning (same as css/style.css)
const LEVEL_NAMES = ["Normal", "Watch", "Warning"];
const HAZARD_COLORS = { avalanche: "#2c5f6b", rockfall: "#7a5c3e", mudflow: "#8a5a2b", earthquake: "#4b3f72", landslide: "#a0522d", flood: "#2b7a8a" };
const HAZARD_NAMES = { avalanche: "Avalanche", rockfall: "Rockfall", mudflow: "Mudflow", earthquake: "Earthquake", landslide: "Landslide", flood: "Flood" };

// ---------- small helpers ----------
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtNum = v => typeof v === "number" ? v.toLocaleString("en-US").replace(/,/g, " ") : esc(v);
const round1 = v => Math.round((v ?? 0) * 10) / 10;

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------- sites ----------
let SITES = [];

function nearestSection(lat, lon) {
  let best = null, bestKm = Infinity;
  for (const s of SECTIONS) {
    const km = distanceKm(lat, lon, s.lat, s.lon);
    if (km < bestKm) { best = s; bestKm = km; }
  }
  return bestKm <= SECTION_MAX_KM ? best.id : null;
}

function initSites() {
  SITES = [];
  for (const ds of DATASETS) {
    for (const s of ds.sites) {
      const site = { ...s, dataset: ds };
      site.hazard = s.hazard || ds.hazard || "avalanche";
      site.hasLocation = typeof s.lat === "number" && typeof s.lon === "number";
      site.section = s.section || (site.hasLocation ? nearestSection(s.lat, s.lon) : null);
      SITES.push(site);
    }
  }
  markActiveNav();
}

const sectionById = id => SECTIONS.find(s => s.id === id);
const sitesIn = id => SITES.filter(s => s.section === id);
const hazardsIn = id => new Set(sitesIn(id).map(s => s.hazard));
const usedSections = () => SECTIONS.filter(s => sitesIn(s.id).length);
function countsIn(id) {
  const c = {};
  for (const s of sitesIn(id)) c[s.hazard] = (c[s.hazard] || 0) + 1;
  return c;
}
function countText(id) {
  const c = countsIn(id);
  const many = { avalanche: "avalanche sites", rockfall: "rockfall zones", earthquake: "villages with damaged houses", mudflow: "past mudflows" };
  const one = { avalanche: "avalanche site", rockfall: "rockfall zone", earthquake: "village with damaged houses", mudflow: "past mudflow" };
  return Object.entries(c).map(([k, n]) => `${n} ${(n === 1 ? one[k] : many[k]) || k + " sites"}`).join(" · ");
}
function datasetLabel(ds) {
  if (ds.kind === "road") return "Road survey";
  if (ds.id === "shug2017") return "Shugnan DB 2017";
  if (ds.kind === "village") return "Village DB 2017";
  if (ds.hazard === "rockfall") return "Rockfall (AKAH)";
  if (ds.kind === "zone-shapes") return "Zones (KML)";
  if (ds.kind === "damage") return "Damaged houses";
  if (ds.kind === "history") return "Past mudflows (atlas)";
  return ds.title;
}

function siteSummary(s) {
  const parts = [];
  if (s.chainage) parts.push("ПК " + s.chainage);
  if (s.avalancheType) parts.push(s.avalancheType);
  if (s.volume_m3) parts.push(fmtNum(s.volume_m3) + " m³");
  if (s.releaseAlt_m) parts.push("starts " + fmtNum(s.releaseAlt_m) + " m");
  if (s.slope) parts.push(s.slope);
  if (s.households) parts.push(s.households + " households");
  if (s.area_ha) parts.push(s.area_ha + " ha danger zone");
  if (s.damagedHouses) parts.push(`${s.damagedHouses} damaged houses, ${s.peopleInDamagedHouses} people`);
  if (s.attrs?.Intensity) parts.push("intensity " + s.attrs.Intensity.toLowerCase());
  if (s.attrs?.["Return Period"]) parts.push("return period " + s.attrs["Return Period"]);
  if (s.hazard === "rockfall" && s.frequency) parts.push(s.frequency);
  if (s.dataset.kind === "history") parts.push([s.date, s.cause].filter(Boolean).join(", "));
  if (s.note) parts.push(s.note);
  return parts.join(" · ");
}

// Rockfall zones can have several parts (участки) from the AKAH table
function subsitesHtml(s) {
  if (!s.subsites || !s.subsites.length) return "";
  return `<div class="subs">${s.subsites.map(x => `
    <details${s.subsites.length === 1 ? " open" : ""}>
      <summary><b>${esc(x.site_ru)}</b>${x.households || x.houses ? ` · ${esc(x.households || x.houses)} households` : ""}${x.area_ha ? ` · ${esc(x.area_ha)} ha` : ""}</summary>
      <table>${[
        ["Starts at", x.release_ru], ["Rocks", x.rocks_ru], ["Block size", x.blockSize], ["Max volume", x.maxVolume],
        ["Reaches", x.runout_ru], ["Distance to houses", x.distanceToHouses], ["How often", x.frequency],
        ["At risk", x.atRisk_ru], ["Recommended", x.recommendations_ru],
      ].filter(r => r[1]).map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1]).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>
    </details>`).join("")}</div>`;
}

const showsWeather = s => s.hazard !== "earthquake" && s.dataset.kind !== "history";

/** result = the weather result for the site's section (or null) */
function popupHtml(s, result) {
  const sec = sectionById(s.section);
  const rows = [
    ["Place", s.subsites ? "" : s.place ? s.place + (s.place_ru ? ` (${s.place_ru})` : "") : ""],
    ["District", [s.district, s.jamoat && s.jamoat !== s.place ? "jamoat " + s.jamoat : ""].filter(Boolean).join(", ")],
    ["Section", sec ? sec.name : ""],
    ["Road chainage", s.chainage ? "ПК " + s.chainage : ""],
    ["Avalanche type", s.avalancheType],
    ["Snow volume", s.volume_m3 ? fmtNum(s.volume_m3) + " m³" : ""],
    ["Path length", s.path_m ? fmtNum(s.path_m) + " m" : ""],
    ["Area", s.area_m2 ? fmtNum(s.area_m2) + " m²" : ""],
    ["Slope", s.slope],
    ["Release / runout", s.releaseAlt_m ? `${fmtNum(s.releaseAlt_m)} m → ${fmtNum(s.runoutAlt_m)} m` : ""],
    ["How often", s.subsites ? "" : s.frequency], ["Season", s.season],
    ["Households at risk", s.households],
    ["Danger zone", s.area_ha ? s.area_ha + " ha" : ""],
    ["When", s.dataset.kind === "history" ? s.date : ""], ["Volume", s.volume], ["Made of", s.composition], ["Cause", s.cause],
    ["Damaged houses", s.damagedHouses], ["People living in them", s.peopleInDamagedHouses],
    ["Position from", s.positionSource],
    ["At risk", s.infrastructure_ru],
    ["Protection", s.protection],
    ["Recommended", s.recommendations_ru],
    ["Note", s.note], ["Checked", s.dataset.kind === "history" ? "" : s.date],
    ["Data fix", s.fixed],
  ];
  const ATTR_NAMES = { "Intensity (Defined in Source)": "Value in source data", "Hazard Name": "Hazard", "Hazard ID": "Hazard ID (AKAH)" };
  if (s.attrs) for (const [k, v] of Object.entries(s.attrs)) rows.push([ATTR_NAMES[k] || k, v]);
  const titlePlace = s.place && s.place !== s.name && !s.name.includes(s.place.split(" ")[0]);
  return `<div class="pop">
    <div class="pop-title">${esc(s.name)}${titlePlace ? " · " + esc(s.place) : ""}</div>
    ${result && showsWeather(s) ? `<div class="pill" data-l="${result.level}">${LEVEL_NAMES[result.level]}</div>` : ""}
    <table>${rows.filter(r => r[1] !== "" && r[1] != null).map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}</table>
    ${subsitesHtml(s)}
    ${s.noteLost ? '<div class="warn-note">Part of the note was lost (file encoding).</div>' : ""}
    ${s.approxLocation ? `<div class="warn-note">Approximate position: ${esc(s.approxLocation)}.${s.hazard === "rockfall" ? " The hatched zone on the AKAH map layer shows the real area." : ""}</div>` : ""}
    <div class="pop-src">${esc(s.dataset.title)} · ${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}</div>
  </div>`;
}

// ---------- maps ----------
function makeMap(elementId, options = {}) {
  const map = L.map(elementId, { scrollWheelZoom: options.wheel ?? true, zoomControl: true });
  const base = {
    "Topographic": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, attribution: "© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)" }),
    "Street map": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap contributors" }),
    "Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, attribution: "Imagery © Esri" }),
  };
  base[options.base || "Topographic"].addTo(map);
  map.createPane("images").style.zIndex = 350;   // scanned maps, slope maps
  map.createPane("vectors").style.zIndex = 360;  // GeoJSON layers (boundaries …)
  map.createPane("zones").style.zIndex = 380;    // zone outlines, under the point markers
  L.control.scale({ metric: true, imperial: false }).addTo(map);
  map.setView([37.9, 71.8], 8);
  return { map, base };
}

function markerRadius(s) {
  if (!s.volume_m3 || typeof s.volume_m3 !== "number") return 6;
  return Math.max(4, Math.min(13, 4 + 2.2 * Math.log10(s.volume_m3 / 1000)));   // bigger avalanche = bigger circle
}

const rockIcon = color => L.divIcon({ className: "rock-icon", iconSize: [16, 16], iconAnchor: [8, 8],
  html: `<span style="background:${color}"></span>` });

/** Draws every site. resultFor(sectionId) gives the weather result used in popups. */
function addSites(map, resultFor = () => null) {
  const markers = new Map(), datasetLayers = {};
  for (const ds of DATASETS) datasetLayers[ds.title] = L.layerGroup().addTo(map);
  for (const s of SITES) {
    if (!s.hasLocation) continue;
    let m;
    if (s.shape) {
      const high = /high/i.test(s.attrs?.Intensity || "");
      m = L.polygon(s.shape, { pane: "zones", color: COLORS[0], weight: high ? 2 : 1.2, fillColor: COLORS[0], fillOpacity: 0.35 });
    } else if (s.dataset.kind === "history") {
      m = L.circle([s.lat, s.lon], { pane: "zones", radius: (s.approxRadius_km || 5) * 1000, color: "#8a5a2b",
        weight: 1.5, dashArray: "5 5", fillColor: "#8a5a2b", fillOpacity: 0.08 });
    } else if (s.hazard === "earthquake") {
      m = L.marker([s.lat, s.lon], { icon: L.divIcon({ className: "dmg-icon", iconSize: null, html: `<span>${esc(s.damagedHouses ?? "")}</span>` }) });
    } else if (s.hazard === "rockfall") {
      m = L.marker([s.lat, s.lon], { icon: rockIcon(COLORS[0]) });
    } else {
      const village = s.dataset.kind === "village";
      m = L.circleMarker([s.lat, s.lon], { radius: markerRadius(s), weight: village ? 2.5 : 1.5,
        color: village ? "#1e2a2c" : "#faf7f0", fillOpacity: 0.9, fillColor: COLORS[0] });
    }
    m.bindPopup(() => popupHtml(s, resultFor(s.section)), { maxWidth: 380, maxHeight: 380 });
    m.bindTooltip(`${s.name}${s.place ? " · " + s.place : ""}`, { direction: "top", offset: [0, -6] });
    m.addTo(datasetLayers[s.dataset.title]);
    markers.set(s.id, m);
  }
  return { markers, datasetLayers };
}

/** levelFor(site) → 0, 1 or 2 */
function colorSites(markers, levelFor) {
  for (const s of SITES) {
    const m = markers.get(s.id);
    if (!m || !showsWeather(s)) continue;
    const color = COLORS[levelFor(s) || 0];
    if (s.shape) m.setStyle({ color, fillColor: color });
    else if (s.hazard === "rockfall") m.setIcon(rockIcon(color));
    else m.setStyle({ fillColor: color });
  }
}

function addOverlays(map) {
  const layers = {};
  for (const o of OVERLAYS) {
    const layer = L.imageOverlay(o.image, o.bounds, { opacity: o.opacity ?? 0.85, pane: "images", attribution: o.attribution || "" });
    layers[o.title] = layer;
    if (o.show !== false) layer.addTo(map);
  }
  return layers;
}

function geoLayer(geojson, color = "#5b4a8a", title = "") {
  return L.geoJSON(geojson, {
    pane: "vectors",
    style: () => ({ color, weight: 1.5, fillColor: color, fillOpacity: 0.08 }),
    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, color: "#fff", weight: 1, fillColor: color, fillOpacity: 0.9 }),
    onEachFeature: (f, layer) => {
      const props = Object.entries(f.properties || {}).filter(([, v]) => v !== null && v !== "" && typeof v !== "object");
      if (props.length) layer.bindPopup(`<div class="pop"><div class="pop-title">${esc(title)}</div><table>${props.slice(0, 25)
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table></div>`, { maxHeight: 320 });
    },
  });
}

function addGeoLayers(map) {
  const layers = {};
  for (const g of GEOLAYERS) {
    const layer = geoLayer(g.geojson, g.color, g.title);
    layers[g.title] = layer;
    if (g.show !== false) layer.addTo(map);
  }
  return layers;
}

function fitAll(map, extra = []) {
  const b = L.latLngBounds(SITES.filter(s => s.hasLocation).map(s => [s.lat, s.lon]));
  for (const o of OVERLAYS) b.extend(o.bounds);
  for (const p of extra) b.extend(p);
  if (b.isValid()) map.fitBounds(b.pad(0.05));
}

// ---------- your own files (GeoJSON, KML, CSV with lat/lon) ----------
function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = l => { const out = []; let cur = "", q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out.map(x => x.trim()); };
  const head = split(lines[0]).map(h => h.toLowerCase());
  const li = head.findIndex(h => ["lat", "latitude", "y", "широта"].includes(h));
  const lo = head.findIndex(h => ["lon", "lng", "long", "longitude", "x", "долгота"].includes(h));
  if (li < 0 || lo < 0) throw new Error("The CSV needs columns named lat and lon (or latitude and longitude).");
  const features = lines.slice(1).map(split).map(r => ({ type: "Feature",
    properties: Object.fromEntries(head.map((h, i) => [h, r[i]])),
    geometry: { type: "Point", coordinates: [parseFloat(r[lo].replace(",", ".")), parseFloat(r[li].replace(",", "."))] } }))
    .filter(f => !isNaN(f.geometry.coordinates[0]) && !isNaN(f.geometry.coordinates[1]));
  return { type: "FeatureCollection", features };
}

function parseKML(text) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const coords = el => el.textContent.trim().split(/\s+/).map(c => c.split(",").slice(0, 2).map(Number));
  const features = [];
  for (const pm of doc.getElementsByTagName("Placemark")) {
    const props = { name: pm.getElementsByTagName("name")[0]?.textContent || "" };
    for (const d of pm.getElementsByTagName("SimpleData")) props[d.getAttribute("name")] = d.textContent;
    const geoms = [];
    for (const p of pm.getElementsByTagName("Polygon")) {
      const ob = p.getElementsByTagName("outerBoundaryIs")[0]?.getElementsByTagName("coordinates")[0];
      if (ob) geoms.push({ type: "Polygon", coordinates: [coords(ob)] });
    }
    for (const l of pm.getElementsByTagName("LineString")) geoms.push({ type: "LineString", coordinates: coords(l.getElementsByTagName("coordinates")[0]) });
    for (const p of pm.getElementsByTagName("Point")) geoms.push({ type: "Point", coordinates: coords(p.getElementsByTagName("coordinates")[0])[0] });
    for (const g of geoms) features.push({ type: "Feature", properties: props, geometry: g });
  }
  return { type: "FeatureCollection", features };
}

/** Reads a file the viewer picked and returns GeoJSON */
async function readUserFile(file) {
  const text = await file.text();
  const name = file.name.toLowerCase();
  if (name.endsWith(".kml")) return parseKML(text);
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCSV(text);
  const gj = JSON.parse(text);
  if (gj.crs && /3857|32642|32643/.test(JSON.stringify(gj.crs))) throw new Error("This GeoJSON is not in lat/lon (WGS 84). Save it again as EPSG:4326 in QGIS.");
  return gj;
}

// ---------- downloads ----------
function download(filename, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function siteProperties(s) {
  const p = {};
  for (const [k, v] of Object.entries(s)) {
    if (["dataset", "shape", "lat", "lon", "hasLocation"].includes(k) || v === null || v === undefined) continue;
    if (k === "subsites") { p.parts = v.map(x => x.site_ru).join(" | "); continue; }
    if (k === "attrs") { for (const [ak, av] of Object.entries(v)) p[ak] = av; continue; }
    p[k] = v;
  }
  p.dataset = s.dataset.title;
  return p;
}

function sitesToGeoJSON(sites) {
  return {
    type: "FeatureCollection",
    features: sites.filter(s => s.hasLocation).map(s => ({
      type: "Feature", properties: siteProperties(s),
      geometry: s.shape
        ? { type: "Polygon", coordinates: s.shape.map(ring => ring.map(([la, lo]) => [lo, la])) }
        : { type: "Point", coordinates: [s.lon, s.lat] },
    })),
  };
}

function sitesToCSV(sites) {
  const rows = sites.map(s => ({ ...siteProperties(s), lat: s.lat ?? "", lon: s.lon ?? "" }));
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => { const t = String(v ?? ""); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return "﻿" + [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\n");   // ﻿ lets Excel read Cyrillic
}

// ---------- navigation ----------
function markActiveNav() {
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach(a => {
    if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
  });
}
