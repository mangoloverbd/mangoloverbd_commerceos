import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const SOURCE_LOGO =
  process.argv[2] ??
  `${process.env.HOME}/Downloads/Untitled design (15).png`;
const OUTPUT = resolve(process.cwd(), "public/opengraph.png");

const WIDTH = 1200;
const HEIGHT = 630;
const LOGO_SIZE = 440;

const logoBuffer = await sharp(SOURCE_LOGO, { failOn: "none" })
  .resize({ width: LOGO_SIZE, height: LOGO_SIZE, fit: "inside", withoutEnlargement: true })
  .flatten({ background: "#ffffff" })
  .png()
  .toBuffer();

await sharp({
  create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#ffffff" },
})
  .composite([{ input: logoBuffer, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(OUTPUT);

const { size } = await stat(OUTPUT);
const meta = await sharp(OUTPUT).metadata();
console.log(
  `Wrote ${OUTPUT} — ${meta.width}x${meta.height}, ${(size / 1024).toFixed(1)} KB`,
);
