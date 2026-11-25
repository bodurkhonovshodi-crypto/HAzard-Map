// Service worker for the installable web app (PWA). Not used inside the Android app.
// The list below is written by `npm run precache` (scripts/precache.mjs); run it after you add or change files.
const VERSION = "cd3db86104d6";
const PRECACHE = /*PRECACHE*/[
 "css/style.css",
 "data/avalanche_db_shugnan_2017.js",
 "data/avalanche_zones_shugnan_ishkashim.js",
 "data/damaged_houses.js",
 "data/events.js",
 "data/mudflows_atlas_155.js",
 "data/overlay_khorog_rockfall_map.js",
 "data/overlay_slope_dem_A.js",
 "data/overlay_slope_dem_B.js",
 "data/overlay_slope_dem_C.js",
 "data/overlay_slope_dem_D.js",
 "data/overlays/khorog_rockfall_map.jpg",
 "data/overlays/slope_dem_A.png",
 "data/overlays/slope_dem_B.png",
 "data/overlays/slope_dem_C.png",
 "data/overlays/slope_dem_D.png",
 "data/road_survey_rushan_shugnan.js",
 "data/rockfall_khorog_2020.js",
 "data/sections.js",
 "data/village_database_2017.js",
 "data.html",
 "events.html",
 "icons/apple-touch-icon.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/maskable-512.png",
 "images/events/eq2015_boulder_tent.jpg",
 "images/events/eq2015_boulder_tent_2.jpg",
 "images/events/eq2015_shakemap.jpg",
 "images/events/khorog_damaged_house_2017.jpg",
 "images/events/khorog_rockfall_boulders.jpg",
 "images/events/khorog_rockfall_road.jpg",
 "images/events/khorog_rockfall_wall.jpg",
 "images/events/khorog_slope_city.jpg",
 "images/events/khorog_view.jpg",
 "images/events/khorog_winter_slope.jpg",
 "index.html",
 "js/app-shell.js",
 "js/common.js",
 "js/data-files.js",
 "js/data-page.js",
 "js/events.js",
 "js/home.js",
 "js/loader.js",
 "js/registry.js",
 "js/rules.js",
 "js/simulate.js",
 "manifest.webmanifest",
 "simulate.html",
 "vendor/leaflet/images/layers-2x.png",
 "vendor/leaflet/images/layers.png",
 "vendor/leaflet/images/marker-icon-2x.png",
 "vendor/leaflet/images/marker-icon.png",
 "vendor/leaflet/images/marker-shadow.png",
 "vendor/leaflet/leaflet.css",
 "vendor/leaflet/leaflet.js"
]/*END*/;

const APP_CACHE = "phw-app-" + VERSION;
const TILE_CACHE = "phw-tiles";
const FONT_CACHE = "phw-fonts";
const MAX_TILES = 2500;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys())
      if (key.startsWith("phw-app-") && key !== APP_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Forecast and climate data: always ask the network (the pages handle being offline).
  if (/open-meteo\.com$/.test(url.hostname)) return;

  // App files: answer from the cache at once, refresh it in the background.
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      return (await network) || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
    })());
    return;
  }

  // Map tiles: keep the ones you have looked at, so the map still shows offline in the field.
  if (/tile\.opentopomap\.org$|tile\.openstreetmap\.org$|arcgisonline\.com$/.test(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") { cache.put(req, res.clone()); event.waitUntil(trim(TILE_CACHE, MAX_TILES)); }
        return res;
      } catch (e) { return Response.error(); }
    })());
    return;
  }

  // Google Fonts.
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })());
  }
});
