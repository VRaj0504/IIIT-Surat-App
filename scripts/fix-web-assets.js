// Run automatically after `expo export` (see "build:web" in package.json).
//
// The web export puts the icon fonts under dist/assets/node_modules/...
// Several hosting tools silently skip any folder called node_modules, so the
// fonts never reach the server and every icon shows as an empty square.
// This renames that folder to dist/assets/vendor and updates every reference
// to it, so nothing on the path can be mistaken for a dependency folder.
const fs = require("fs");
const path = require("path");

const dist = path.resolve(process.argv[2] || path.join(__dirname, "..", "dist"));
const from = path.join(dist, "assets", "node_modules");
const to = path.join(dist, "assets", "vendor");

if (!fs.existsSync(from)) {
  console.log("fix-web-assets: no assets/node_modules folder found, nothing to do.");
  process.exit(0);
}

fs.rmSync(to, { recursive: true, force: true });
fs.renameSync(from, to);

let filesUpdated = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(js|css|html|json)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      if (text.includes("assets/node_modules/")) {
        fs.writeFileSync(full, text.split("assets/node_modules/").join("assets/vendor/"));
        filesUpdated++;
      }
    }
  }
})(dist);

console.log(`fix-web-assets: moved fonts to assets/vendor, updated ${filesUpdated} file(s).`);
