import { build } from "esbuild";
import { cpSync } from "node:fs";

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
console.log("Built dist/ — load dist/manifest.json via about:debugging");
