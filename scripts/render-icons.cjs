(async () => {
// Renders assets/*.svg to PNGs (PWA icons in www/icons, sources for Android icons in assets/).
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const jobs = [
  ["assets/icon.svg", "assets/icon-only.png", 1024, false],
  ["assets/icon-foreground.svg", "assets/icon-foreground.png", 1024, true],
  ["assets/icon.svg", "www/icons/icon-512.png", 512, false],
  ["assets/icon.svg", "www/icons/icon-192.png", 192, false],
  ["assets/icon.svg", "www/icons/apple-touch-icon.png", 180, false],
  ["assets/icon.svg", "www/icons/maskable-512.png", 512, false],
];
const browser = await chromium.launch();
for (const [src, out, size, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${readFileSync(src, "utf8")}`);
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
}
await browser.close();
console.log("icons rendered");
})();
