import { build } from "esbuild";
import { cpSync, readFileSync } from "node:fs";
import sharp from "sharp";

await build({
  entryPoints: {
    content: "src/content.ts",
    popup: "src/popup/popup.ts",
  },
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: ["firefox115"],
  logLevel: "info",
});

cpSync("src/manifest.json", "dist/manifest.json");
cpSync("src/content.css", "dist/content.css");
cpSync("src/popup/popup.html", "dist/popup.html");
cpSync("src/popup/popup.css", "dist/popup.css");

// Rasterise the single SVG source into the PNG sizes the manifest declares.
// Firefox would accept the SVG directly, but Chrome needs PNGs, so we ship
// PNGs to keep one icon pipeline for both. Rendered at 4x then downscaled so
// the small sizes stay crisp.
const ICON_SIZES = [16, 32, 48, 96, 128];
const iconSvg = readFileSync("src/icons/icon.svg");
await Promise.all(
  ICON_SIZES.map((size) =>
    sharp(iconSvg, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(`dist/icon-${size}.png`)
  )
);

console.log("Built dist/ — load dist/manifest.json via about:debugging");
