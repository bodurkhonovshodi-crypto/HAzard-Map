// Loads every file in DATA_FILES, one after another.
// Pages wait for DATA_READY before they start: DATA_READY.then(start)
const DATA_READY = DATA_FILES.reduce((chain, src) => chain.then(() => new Promise(resolve => {
  const s = document.createElement("script");
  s.src = src;
  s.onload = resolve;
  s.onerror = () => { console.error("Could not load " + src + " — check the name in js/data-files.js"); resolve(); };
  document.head.appendChild(s);
})), Promise.resolve());
