// Road sections / valleys used for weather checks and alerts.
// Every site is put in the section whose forecast point is nearest (up to maxKm away).
// To add a new area: copy one line, give it a new id, a name, and a point in the middle of the valley.
// forecastAlt_m = altitude used for the forecast. Avalanches start high on the slopes,
// so we ask for weather near typical release altitude, not at the valley floor.
const SECTIONS = [
  { id: "yaz",   name: "Yazgulom and Panj road north of Rushan", lat: 38.07, lon: 71.28, forecastAlt_m: 2700 },
  { id: "vdar",  name: "Panj road: Vanj fork to Darvoz",          lat: 38.25, lon: 71.06, forecastAlt_m: 2500 },
  { id: "vanj",  name: "Vanj valley",                              lat: 38.33, lon: 71.46, forecastAlt_m: 2800 },
  { id: "kkh",   name: "Kalai-Khumb area (Darvoz)",                lat: 38.25, lon: 70.47, forecastAlt_m: 2000 },
  { id: "rkh",   name: "Rushan to Khorog",                         lat: 37.80, lon: 71.57, forecastAlt_m: 2900 },
  { id: "khg",   name: "Khorog city",                              lat: 37.49, lon: 71.56, forecastAlt_m: 2800 },
  { id: "gunt1", name: "Lower Gunt valley",                        lat: 37.58, lon: 71.73, forecastAlt_m: 3000 },
  { id: "gunt2", name: "Upper Gunt: Vabist to Patkhor",            lat: 37.72, lon: 72.07, forecastAlt_m: 3300 },
  { id: "bart",  name: "Lower Bartang valley",                     lat: 38.00, lon: 71.73, forecastAlt_m: 3000 },
  { id: "pj1",   name: "Panj valley: Nivodak – Virujak",           lat: 37.46, lon: 71.52, forecastAlt_m: 3000 },
  { id: "pj2",   name: "Panj valley: Virujak – Khaskhorog",        lat: 37.37, lon: 71.49, forecastAlt_m: 3000 },
  { id: "pj3",   name: "Panj valley: Khaskhorog – Vozg",           lat: 37.21, lon: 71.47, forecastAlt_m: 3000 },
  { id: "pj4",   name: "Panj valley: Vozg – Sumjiv (Ishkashim)",   lat: 37.03, lon: 71.48, forecastAlt_m: 3000 },
];
const SECTION_MAX_KM = 35;
