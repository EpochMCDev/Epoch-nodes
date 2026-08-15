# squaremap nodes editor for nodes meme plugin

Nodes squaremap viewer/editor, a port of the dynmap editor
(`../dynmap/`) that runs on top of the squaremap web frontend instead
of dynmap.

The overall architecture:
-   React js handles ui layout. Nodes in map are `svg` elements
    laid out by React. The React DOM layer is injected into a plain
    Leaflet map that loads squaremap tiles (`/tiles/...`).
-   The internal nodes map geometry module (`World` / `IndexSampler`)
    is a **pure-JS port** of the rust/wasm module used by the dynmap
    editor. It lives in `src/wasm_main.js` and shadows
    `../dynmap/wasm/wasm_main.js` through the webpack `resolve.modules`
    order (`squaremap/src` before `dynmap/wasm`). **No Rust toolchain
    is required to build or run the squaremap editor**; `dynmap/` is
    untouched and still builds with its real wasm module.

# Requirements/Installation
## Requirements
1. node.js (>= 18)
2. npm

(Rust / wasm-bindgen are NOT required — see `src/wasm_main.js`.)

## Installation
1. Download/install node.js and npm: <https://nodejs.org/en/download>

2. Install npm packages:
```
npm install
```

3. (Optional) run the geometry module unit tests:
```
npm test
```

If everything works, run the production build:

```
npm run build
```

which runs webpack and generates the editor files in `/build`.

# Development
1. Run `npm run dev` in this repo root to start the webpack dev
   environment (webpack-dev-server on port 80).
2. The dev server proxies `/tiles` and `/nodes` to a local squaremap
   server on `:8080`, so tiles and the nodes json files load from a
   running server.
3. Go to `http://localhost/nodes-editor/editor.html` for the editor
   page, or `http://localhost/nodes-editor/nodes.html` for the
   viewer-only page.

# Build for release
`npm run build`

1. Runs webpack on the js/react (no wasm step; the geometry module is
   the pure-JS port `src/wasm_main.js`).
2. Generates files in the `/build` directory.

Copy all generated files into the squaremap web directory of the
Minecraft server:

```
plugins/squaremap/web/nodes-editor/
```

(e.g. `build/editor.html` -> `plugins/squaremap/web/nodes-editor/editor.html`,
keeping the `css/`, `js/` and `images/` subdirectories intact).

The editor fetches the nodes json state files from
`/nodes/{config,world,towns,ports}.json`; the `nodes-squaremap`
plugin (../nodes-squaremap) copies them to
`plugins/squaremap/web/nodes/` on startup (`copy-json-to-web: true`),
so no manual copying of the json files is needed. Note:
- `world.json` is exported from this editor and uploaded to
  `plugins/nodes/world.json` by the admin (the nodes plugin never
  creates it).
- `config.json` (global territory cost settings, `meta.type: "config"`)
  is admin-authored at `plugins/nodes/config.json`; the addon copies it
  to the web directory automatically.
- `towns.json`/`ports.json` are written by the nodes plugin itself.
- Resource node icons ship with the build (`nodes/resource_icons.json`
  + `images/nodes/resources/`) so the editor works out of the box.

Then open:
- `http://<server>/nodes-editor/editor.html` — editor
- `http://<server>/nodes-editor/nodes.html` — viewer

# Folder structure
```
build/             - webpack build outputs (copy into plugins/squaremap/web/nodes-editor/)
src/
 ├─ squaremap/     - html entry pages + css + static editor assets
 │  ├─ editor.html - editor page
 │  ├─ nodes.html  - viewer-only page
 │  ├─ css/        - global css
 │  ├─ nodes/      - resource_icons.json (shipped with the build)
 │  └─ images/     - node resource icons (images/nodes/resources/)
 ├─ bootstrap.js   - async entry, exposes window.Nodes + window.MapGlue
 ├─ mapGlue.js     - leaflet map that loads squaremap tiles (CRS.Simple,
 │                   block <-> latlng projection, /tiles/settings.json)
 ├─ nodes.js       - fork of dynmap/src/nodes.js with the map glue swapped
 ├─ editor/        - fork of the dynmap editor ui (dynmap/src/editor):
 │                   chinese ui text, tab labels, brush size +/- buttons;
 │                   panes/ has the translated territory/nodes/generation/
 │                   options/world/towns panels
 ├─ world/         - world.jsx fork using the squaremap projection
 ├─ wasm_main.js   - pure-JS port of the rust/wasm geometry module
 │                   (World + IndexSampler); shadows dynmap/wasm
 └─ constants.js   - copied from dynmap
webpack/           - webpack configs
test/              - node unit tests for wasm_main.js
```

`../dynmap/src/` (shared react components) and `../dynmap/wasm/`
(real wasm module, only used by the dynmap build) are resolved by
webpack but never modified.

# Acknowledgements
This editor is a port of the dynmap nodes editor
(https://github.com/webbukkit/dynmap), running on squaremap
(https://github.com/jpenilla/squaremap) tiles with Leaflet
(https://leafletjs.com/).
