// Every file in data/ calls one of these functions. They collect everything in lists the pages read.
const DATASETS = [];   // hazard sites:    registerDataset({ id, title, hazard, kind, source, sites: [...] })
const OVERLAYS = [];   // map images:      registerOverlay({ id, title, image, bounds: [[south, west], [north, east]], ... })
const GEOLAYERS = [];  // GeoJSON layers:  registerGeoLayer({ id, title, geojson, color, show, source })
const EVENTS = [];     // past disasters:  registerEvents([{ id, title, date, type, lat, lon, ... }])

function registerDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.sites)) {
    console.error("registerDataset: the file has no 'sites' list", dataset);
    return;
  }
  DATASETS.push(dataset);
}

function registerOverlay(overlay) {
  if (!overlay || !overlay.image || !overlay.bounds) {
    console.error("registerOverlay: needs 'image' and 'bounds'", overlay);
    return;
  }
  OVERLAYS.push(overlay);
}

function registerGeoLayer(layer) {
  if (!layer || !layer.geojson) {
    console.error("registerGeoLayer: needs 'geojson'", layer);
    return;
  }
  GEOLAYERS.push(layer);
}

function registerEvents(list) {
  for (const e of list || []) EVENTS.push(e);
}
