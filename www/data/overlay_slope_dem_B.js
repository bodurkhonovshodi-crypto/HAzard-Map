// Made by tools/dem_to_slope.py
registerOverlay({
 "id": "slope-dem-B",
 "title": "Slope map: DEM B (37.55°N, 72.76°E)",
 "image": "data/overlays/slope_dem_B.png",
 "bounds": [
  [
   37.4833266,
   72.719835
  ],
  [
   37.6069312,
   72.7927219
  ]
 ],
 "opacity": 1,
 "show": true,
 "legend": [
  {
   "color": "rgba(232,140,30,0.67)",
   "label": "30–45°: avalanche release slopes"
  },
  {
   "color": "rgba(150,30,120,0.75)",
   "label": "over 45°: steep rock, rockfall sources"
  }
 ],
 "attribution": "Slope from your DEM B (UTM 42N)"
});
