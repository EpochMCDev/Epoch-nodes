# nodes-squaremap (squaremap addon for nodes)

Renders the nodes plugin state (territories, resource nodes, ports) as
markers on the squaremap web map. Companion to the `nodes` plugin and
to the squaremap web editor in `../squaremap/`.

The overall architecture:
-   Pure file coupling: this addon polls the nodes plugin json state
    files (`plugins/nodes/world.json`, `towns.json`, `ports.json`) and
    rebuilds squaremap markers only when a file changes. It does NOT
    depend on the unstable nodes plugin API.
-   Territory borders are computed from the territory chunk sets
    (TerritoryOutline algorithm: chunk grid -> border rings, supports
    holes/nested/diagonal-contact regions, semantically identical to
    the editor's `wasm_main.js` `getTerritoryBorder`).
-   A "Nodes" layer is registered on every enabled squaremap world:
    territory polygons (colored by town/nation, occupied territories
    stroked with the occupier color), generated node icons, port
    icons, and town name text sprites.
-   On enable, the 4 json files are also copied to
    `plugins/squaremap/web/nodes/` so the squaremap web editor
    (`/nodes-editor/`) can fetch them over http.

# Requirements
1. Paper 26.2+ server (api-version 26.2).
2. squaremap plugin 1.3.11+ (`depend: [squaremap]`).
3. The nodes plugin writing `plugins/nodes/*.json`
   (world.json / towns.json / ports.json).

# Build
```
cd nodes-squaremap
./gradlew build
```
The jar is written to `build/libs/nodes-squaremap-0.0.1.jar`.

Run the unit tests (TerritoryOutline algorithm):
```
./gradlew test
```

# Installation
1. Copy `build/libs/nodes-squaremap-0.0.1.jar` into the server's
   `plugins/` folder (squaremap must be installed and enabled).
2. Restart the server (or `/reload confirm` with squaremap present).
3. The addon reads `plugins/nodes/*.json` on an interval (default 100
   ticks = 5s) and renders markers on the squaremap world.

Open the squaremap web page and check the "Nodes" layer.

# Configuration (`config.yml`)
| setting | default | description |
| --- | --- | --- |
| `data-directory` | `plugins/nodes` | where the nodes plugin json files live |
| `update-interval` | `100` | ticks between mtime checks |
| `world` | `auto` | `auto` = every enabled squaremap world, or a list of world names |
| `copy-json-to-web` | `true` | copy the json files to `<squaremap-web>/nodes/` for the web editor |
| `icon-size` | `16` | node/port icon marker pixel size |
| `text-size` | `20` | town/nation name text sprite pixel height |
| `render.*` | | toggles for territories, border-only mode, node icons, ports, town/nation names |
| `unowned-color` | `[80,80,80]` | fill color for territories without a town |
| `fill-opacity` | `0.35` | territory polygon fill opacity |
| `stroke-weight` | `2` | territory border stroke pixels |
| `border-color` | `[40,40,40]` | territory border color |
| `icons.<type>` | | RGB color used to draw the generated icon for a node type |

Note: squaremap's own `settings.web-directory.auto-update` overwrites
its web files on startup; the addon copies the json files *after*
squaremap enables, so the copies survive. The web editor files
(`/nodes-editor/`) are static and must be copied manually (or via your
own deployment step) — see `../squaremap/README.md`.

# Folder structure
```
src/main/java/phonon/nodes/squaremap/
 ├─ NodesSquaremapPlugin.java - main plugin class (onEnable copies json to web)
 ├─ NodesData.java            - json state parsing (world/towns/ports)
 ├─ Settings.java             - config.yml access
 ├─ TerritoryOutline.java     - chunk set -> border rings algorithm
 └─ SquaremapRenderer.java    - squaremap layer/marker registration
src/test/.../TerritoryOutlineTest.java - algorithm unit tests
src/main/resources/plugin.yml - name: nodes-squaremap, depend: [squaremap]
src/main/resources/config.yml
```

# Acknowledgements
Built on squaremap: https://github.com/jpenilla/squaremap
(squaremap-api 1.3.11, https://repo.papermc.io).
