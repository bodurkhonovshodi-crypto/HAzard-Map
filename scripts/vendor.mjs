// Copies Leaflet from node_modules into www/vendor so the app works offline
// (the Android app and the installed PWA no longer depend on unpkg.com).
import { cpSync, mkdirSync } from "node:fs";
const out = "www/vendor/leaflet";
mkdirSync(out, { recursive: true });
for (const f of ["leaflet.js", "leaflet.css", "images"])
  cpSync(`node_modules/leaflet/dist/${f}`, `${out}/${f}`, { recursive: true });
console.log("Leaflet copied to " + out);
