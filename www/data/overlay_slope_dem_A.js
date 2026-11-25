// Made by tools/dem_to_slope.py
registerOverlay({
 "id": "slope-dem-A",
 "title": "Slope map: DEM A (37.60°N, 73.10°E)",
 "image": "data/overlays/slope_dem_A.png",
 "bounds": [
  [
   37.5352416,
   73.0688476
  ],
  [
   37.6611096,
   73.12516
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
 "attribution": "Slope from your DEM A (UTM 42N)"
});
