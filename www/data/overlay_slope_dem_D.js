// Made by tools/dem_to_slope.py
registerOverlay({
 "id": "slope-dem-D",
 "title": "Slope map: DEM D (37.42°N, 73.06°E)",
 "image": "data/overlays/slope_dem_D.png",
 "bounds": [
  [
   37.3678077,
   72.9950474
  ],
  [
   37.4685097,
   73.131053
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
 "attribution": "Slope from your DEM D (UTM 42N)"
});
