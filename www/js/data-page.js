// ============================================================
//  DATA PAGE: downloads, site register, links to more data
// ============================================================

// Free data sources for GBAO. Links were checked in October 2026.
const SOURCES = [
  { cat: "Boundaries", title: "Administrative boundaries", items: [
    ["HDX: Tajikistan administrative boundaries (COD-AB)", "https://data.humdata.org/dataset/cod-ab-tjk", "Country, oblast and district borders from the Agency on Statistics (2017). Jamoats are not included."],
    ["geoBoundaries", "https://www.geoboundaries.org/", "Open boundaries for every country; choose Tajikistan (TJK), levels ADM1–ADM2."],
  ], how: "Clip to GBAO in QGIS, save as GeoJSON (EPSG:4326), then tools/geojson_to_js.py." },
  { cat: "Population", title: "Where people live", items: [
    ["WorldPop: population counts, 100 m", "https://hub.worldpop.org/project/categories?id=3", "Estimated people per 100 m cell, many years. Choose Tajikistan."],
    ["Kontur Population: 400 m hexagons", "https://geo.btaa.org/catalog/38f46aa9-00dd-4ac9-98c9-5ecaea384c9f", "Population per hexagon as vector data; easy to clip and show as GeoJSON."],
    ["GHSL: built-up areas and settlements", "https://human-settlement.emergency.copernicus.eu/download.php", "Built-up surface and settlement classes from satellite images (EU JRC)."],
  ], how: "Rasters: export a PNG and use tools/image_bounds.py. Hexagons: GeoJSON → tools/geojson_to_js.py." },
  { cat: "NDVI", title: "Vegetation (NDVI) and satellite images", items: [
    ["MODIS MOD13Q1: NDVI every 16 days, 250 m", "https://data.nasa.gov/dataset/modis-terra-vegetation-indices-16-day-l3-global-250m-sin-grid-v061-2eb0d", "Vegetation index since 2000. Good for seeing how slopes green up or lose plants."],
    ["NASA AppEEARS", "https://appeears.earthdatacloud.nasa.gov/", "Draw a box around GBAO and download only that part of MODIS NDVI as GeoTIFF (free Earthdata account)."],
    ["Copernicus Browser (Sentinel-2)", "https://browser.dataspace.copernicus.eu/", "10 m satellite images and ready NDVI views; look at a mudflow before and after (free account)."],
  ], how: "Export a coloured PNG of your area and add it with tools/image_bounds.py." },
  { cat: "Elevation", title: "Elevation (DEM)", items: [
    ["Copernicus DEM GLO-30", "https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM", "Global 30 m elevation model, free."],
    ["OpenTopography: Copernicus 30 m DEM", "https://opentopography.org/node/3557", "Download the same DEM for a box you draw, as GeoTIFF."],
  ], how: "Save as .asc in QGIS (Raster → Conversion → Translate) and run tools/dem_to_slope.py." },
  { cat: "Land cover", title: "Land cover", items: [
    ["ESA WorldCover 10 m (2020)", "https://zenodo.org/records/5571936", "Trees, grass, bare rock, snow and ice, water, built-up at 10 m."],
    ["ESA WorldCover 2021", "https://worldcover2021.esa.int", "The newer 2021 version with a viewer."],
  ], how: "Clip, style in QGIS, export PNG → tools/image_bounds.py." },
  { cat: "Climate", title: "Rain, snow and temperature", items: [
    ["Open-Meteo historical weather (ERA5)", "https://open-meteo.com/en/docs/historical-weather-api", "Daily rain, snow and temperature since 1940 for any point. The Simulation page uses it."],
    ["CHIRPS daily rainfall", "https://www.chc.ucsb.edu/data/chirps", "Rainfall from satellites and stations, 0.05°, 1981 to now, public domain."],
  ], how: "Use for thresholds: compare rain before past mudflows with normal years." },
  { cat: "Glaciers", title: "Glaciers", items: [
    ["Randolph Glacier Inventory 7 (NSIDC)", "https://nsidc.org/data/nsidc-0770/versions/7", "Outline of every glacier (around 2000) as shapefiles. Many GBAO mudflows start at glaciers."],
  ], how: "Clip to GBAO, save as GeoJSON → tools/geojson_to_js.py." },
  { cat: "Hazards", title: "Earthquake and landslide catalogues", items: [
    ["USGS earthquake catalogue", "https://earthquake.usgs.gov/earthquakes/search/", "Search a box around GBAO and download all earthquakes as GeoJSON or KML."],
    ["NASA Global Landslide Catalog", "https://data.nasa.gov/dataset/773bbf7e-d5b2-4474-8431-9f25144fd52e", "Landslides reported in news and reports worldwide, with date and place."],
  ], how: "GeoJSON → open it on the Map page, or keep it with tools/geojson_to_js.py." },
  { cat: "OSM", title: "Roads, rivers, buildings (OpenStreetMap)", items: [
    ["Geofabrik: Tajikistan OpenStreetMap", "https://download.geofabrik.de/asia/tajikistan.html", "Roads, rivers, buildings and places as shapefiles or GeoPackage, updated every day."],
  ], how: "Clip to your valley first; whole-country layers are too big for a web page." },
];

let rows = [];

DATA_READY.then(() => {
  initSites();
  const onMap = SITES.filter(s => s.hasLocation).length;
  $("totals").innerHTML = `
    <span class="chip"><b>${DATASETS.length}</b> hazard datasets</span>
    <span class="chip"><b>${SITES.length}</b> sites, <b>${onMap}</b> with GPS</span>
    <span class="chip"><b>${OVERLAYS.length}</b> map images</span>
    <span class="chip"><b>${EVENTS.length}</b> past disasters</span>`;
  buildDownloads();
  buildRegister();
  buildSources();
});

const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function buildDownloads() {
  $("dsRows").innerHTML = DATASETS.map((ds, i) => {
    const sites = SITES.filter(s => s.dataset === ds);
    const gps = sites.filter(s => s.hasLocation).length;
    return `<tr><td><b>${esc(ds.title)}</b></td><td>${esc(HAZARD_NAMES[ds.hazard] || ds.hazard)}</td>
      <td class="num">${sites.length}</td><td class="num">${gps}</td><td class="details">${esc(ds.source)}</td>
      <td><div class="dl-actions"><button type="button" class="small" data-geo="${i}">GeoJSON</button><button type="button" class="small" data-csv="${i}">CSV</button></div></td></tr>`;
  }).join("");
  $("dsRows").addEventListener("click", e => {
    const g = e.target.dataset.geo, c = e.target.dataset.csv;
    if (g !== undefined) { const ds = DATASETS[g]; download(slug(ds.title) + ".geojson", JSON.stringify(sitesToGeoJSON(SITES.filter(s => s.dataset === ds)))); }
    if (c !== undefined) { const ds = DATASETS[c]; download(slug(ds.title) + ".csv", sitesToCSV(SITES.filter(s => s.dataset === ds)), "text/csv"); }
  });
  $("dlAllGeo").addEventListener("click", () => download("pamir_hazard_watch_all_sites.geojson", JSON.stringify(sitesToGeoJSON(SITES))));
  $("dlAllCsv").addEventListener("click", () => download("pamir_hazard_watch_all_sites.csv", sitesToCSV(SITES), "text/csv"));

  const other = [
    ...OVERLAYS.map(o => ({ name: o.title, what: `Image placed between ${o.bounds[0].join(", ")} and ${o.bounds[1].join(", ")} (south-west, north-east). ${o.attribution || ""}`,
      href: o.image, file: o.image.split("/").pop() })),
    ...GEOLAYERS.map((g, i) => ({ name: g.title, what: g.source || "GeoJSON layer", geo: i })),
    { name: "Weather sections", what: `${SECTIONS.length} valleys with the point and altitude used for forecasts`, sections: true },
    { name: "Past disasters", what: `${EVENTS.length} events with dates, damage and sources`, events: true },
  ];
  $("otherRows").innerHTML = other.map((o, i) => `<tr><td><b>${esc(o.name)}</b></td><td class="details">${esc(o.what)}</td><td>
    ${o.href ? `<a class="small" href="${esc(o.href)}" download="${esc(o.file)}">Image</a>` : `<button type="button" class="small" data-other="${i}">GeoJSON</button>`}</td></tr>`).join("");
  $("otherRows").addEventListener("click", e => {
    const o = other[e.target.dataset.other];
    if (!o) return;
    if (o.sections) download("weather_sections.geojson", JSON.stringify({ type: "FeatureCollection", features: SECTIONS.map(s => ({
      type: "Feature", properties: { id: s.id, name: s.name, forecastAlt_m: s.forecastAlt_m, sites: sitesIn(s.id).length },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] } })) }));
    if (o.events) download("past_disasters.geojson", JSON.stringify({ type: "FeatureCollection", features: EVENTS.map(ev => ({
      type: "Feature", properties: { id: ev.id, title: ev.title, date: ev.dateText, type: ev.type, cause: ev.trigger, place: ev.place,
        approximate: !!ev.approx, facts: ev.facts.map(f => f.join(" ")).join("; "), sources: ev.sources.map(s => s[0]).join("; ") },
      geometry: { type: "Point", coordinates: [ev.lon, ev.lat] } })) }));
    if (o.geo !== undefined) download(slug(o.name) + ".geojson", JSON.stringify(GEOLAYERS[o.geo].geojson));
  });
}

function buildRegister() {
  for (const ds of DATASETS) $("fDataset").add(new Option(ds.title, ds.id));
  for (const sec of usedSections()) $("fSection").add(new Option(sec.name, sec.id));
  $("fSection").add(new Option("No section (no GPS)", "none"));
  ["q", "fDataset", "fSection", "fCheck"].forEach(id => $(id).addEventListener("input", renderTable));
  $("dlFiltered").addEventListener("click", () => download("sites_selection.csv", sitesToCSV(rows), "text/csv"));
  renderTable();
}

function renderTable() {
  const q = $("q").value.trim().toLowerCase();
  const fd = $("fDataset").value, fs = $("fSection").value, fc = $("fCheck").checked;
  rows = SITES.filter(s => {
    if (fd && s.dataset.id !== fd) return false;
    if (fs === "none" ? s.section : fs && s.section !== fs) return false;
    if (fc && s.hasLocation) return false;
    if (q && ![s.name, s.place, s.place_ru, s.district, s.jamoat, s.note].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
  $("regCount").textContent = `${rows.length} sites`;
  const shownRows = rows.slice(0, 600);
  $("tbody").innerHTML = (shownRows.length ? shownRows.map(s => {
    const sec = sectionById(s.section);
    const where = s.hasLocation ? `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`
      : `<span class="tag" title="${esc(s.check || s.noGps)}">${s.check ? "Check GPS" : "No GPS"}</span>`;
    const name = s.hasLocation ? `<a class="rowlink" href="index.html?site=${encodeURIComponent(s.id)}">${esc(s.name)}</a>` : esc(s.name);
    return `<tr><td class="mono">${name}</td><td>${esc(datasetLabel(s.dataset))}</td><td>${esc(s.district || "")}</td><td>${esc(s.place || "")}</td>
      <td>${esc(sec ? sec.name : "—")}</td>
      <td class="details">${esc(siteSummary(s))}${s.noteLost ? ' <span class="lostnote">note lost</span>' : ""}${s.check ? `<div class="lostnote">${esc(s.check)}</div>` : ""}</td>
      <td class="mono">${where}</td></tr>`;
  }).join("") : '<tr><td colspan="7" class="muted">No sites match.</td></tr>')
    + (rows.length > shownRows.length ? `<tr><td colspan="7" class="muted">Showing the first ${shownRows.length}. Search or filter to see others, or download them all.</td></tr>` : "");
}

function buildSources() {
  $("sources").innerHTML = SOURCES.map(s => `<div class="src">
    <h3><span class="cat">${esc(s.cat)}</span>${esc(s.title)}</h3>
    <ul>${s.items.map(([t, u, d]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a><span>${esc(d)}</span></li>`).join("")}</ul>
    <p class="how"><b>Add it:</b> ${esc(s.how)}</p>
  </div>`).join("");
}
