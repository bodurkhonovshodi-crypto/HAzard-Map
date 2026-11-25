// Writes the list of app files into www/sw.js so the installed web app works offline.
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
const ROOT = "www";
const SKIP = new Set(["sw.js"]);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!SKIP.has(name) && !name.startsWith(".")) files.push(relative(ROOT, p).split("\\").join("/"));
  }
})(ROOT);
const hash = createHash("sha256");
for (const f of files) hash.update(f).update(readFileSync(join(ROOT, f)));
const version = hash.digest("hex").slice(0, 12);
let sw = readFileSync(join(ROOT, "sw.js"), "utf8");
sw = sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`)
       .replace(/\/\*PRECACHE\*\/[\s\S]*?\/\*END\*\//, "/*PRECACHE*/" + JSON.stringify(files, null, 1) + "/*END*/");
writeFileSync(join(ROOT, "sw.js"), sw);
console.log(`sw.js: ${files.length} files, version ${version}`);
