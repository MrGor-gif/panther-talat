// Copies the PWA static files (service worker, manifest, icons) from static/
// into the build output (public/) so the Cloudflare Worker serves them from the
// site root. Runs after `vite build` (which empties public/).
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "static");
const outDir = path.join(__dirname, "..", "public");

if (!fs.existsSync(srcDir)) {
  console.error("static/ folder not found — nothing to copy");
  process.exit(0);
}
fs.mkdirSync(outDir, { recursive: true });

for (const name of fs.readdirSync(srcDir)) {
  fs.copyFileSync(path.join(srcDir, name), path.join(outDir, name));
  console.log("copied", name, "-> public/");
}
