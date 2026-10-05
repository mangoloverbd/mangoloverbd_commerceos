// Generates src/assets/world-dots.json: land sample points for the Home globe.
// Dev-time only. Run with the geo packages available, e.g.
//   npm i --no-save d3-geo topojson-client world-atlas && node scripts/generate-world-dots.mjs
// Output is a flat array [lon×10, lat×10, …] on a ~1.6° grid, widened toward the poles.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const world = JSON.parse(readFileSync(require.resolve("world-atlas/land-110m.json"), "utf8"));
const land = feature(world, world.objects.land);

const STEP = 1.6;
const points = [];
for (let lat = -58; lat <= 80; lat += STEP) {
  const lonStep = STEP / Math.max(Math.cos((lat * Math.PI) / 180), 0.25);
  for (let lon = -180; lon < 180; lon += lonStep) {
    if (geoContains(land, [lon, lat])) points.push(Math.round(lon * 10), Math.round(lat * 10));
  }
}

const out = resolve(import.meta.dirname, "../src/assets/world-dots.json");
writeFileSync(out, `${JSON.stringify(points)}\n`);
console.log(`${points.length / 2} points → ${out}`);
