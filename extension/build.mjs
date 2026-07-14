import { build } from "esbuild";
import { cpSync } from "node:fs";

await build({
  entryPoints: ["src/content.ts"],
  bundle: true,
  outfile: "dist/content.js",
  format: "iife",
  target: ["firefox115"],
  logLevel: "info",
});

cpSync("src/manifest.json", "dist/manifest.json");
cpSync("src/content.css", "dist/content.css");
console.log("Built dist/ — load dist/manifest.json via about:debugging");
