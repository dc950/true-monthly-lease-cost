# Build instructions for AMO reviewers

This add-on is written in TypeScript and bundled with esbuild. The shipped
`content.js` / `popup.js` are generated, so this document explains how to
reproduce the exact contents of the submitted package from this source.

## Build environment

- **Operating system:** any of Windows, macOS or Linux. Developed and built on
  Windows 11 (24H2). No OS-specific steps are required.
- **Node.js:** version 24.x (built and tested with 24.14.1). Node 20 or newer
  should also work. Download from https://nodejs.org (the LTS or current
  installer includes npm).
- **npm:** version 11.x (tested with 11.11.0). It is bundled with the Node
  installer above — no separate installation is needed.
- **Network access** is required for the dependency install step only
  (`npm ci` downloads the pinned packages). The build itself is offline.

No other programs or global tools are required. `esbuild`, `typescript`,
`sharp` and the rest are pinned as dev dependencies in `package.json` /
`package-lock.json` and are installed locally by the step below.

## Steps to reproduce the add-on

From the root of this source directory:

```
npm ci          # installs the exact dependency versions from package-lock.json
npm run build   # produces the unpacked add-on in dist/
```

That is the complete build. `npm run build` runs the single build script
[`build.mjs`](build.mjs), which performs every technical step automatically:

1. Bundles the two TypeScript entry points — `src/content.ts` (the content
   script) and `src/popup/popup.ts` (the settings popup) — with esbuild into
   `dist/content.js` and `dist/popup.js`.
2. Copies the static files (`src/manifest.json`, `src/content.css`,
   `src/popup/popup.html`, `src/popup/popup.css`) into `dist/`.
3. Rasterises the single icon source `src/icons/icon.svg` into
   `dist/icon-16.png`, `-32`, `-48`, `-96` and `-128` using sharp.

The resulting `dist/` directory contains exactly the files in the submitted
package: `manifest.json`, `content.js`, `content.css`, `popup.html`,
`popup.js`, `popup.css`, and the five `icon-*.png` files.

## Optional verification

```
npm run typecheck   # tsc --noEmit (strict) — no type errors
npm test            # vitest unit tests against real captured site markup
```

To repackage `dist/` into an installable zip exactly as submitted:

```
npx web-ext build --source-dir=dist --artifacts-dir=web-ext-artifacts --overwrite-dest
```

## Notes on behaviour

- The only permission requested is `storage` (for the user's own term/mileage
  settings, via `storage.sync`). The add-on collects no data — the manifest
  declares `data_collection_permissions: { required: ["none"] }`.
- The content script's only network request is to leasing.com's own public
  search API (`POST /api/deals/search/`), used to find the cheapest deal behind
  a "from" price on that site's category pages. All other sites are handled
  purely by reading the page. There is no telemetry and no external server of
  our own.
