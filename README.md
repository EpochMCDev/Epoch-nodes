# Minecraft nodes plugin
![Nodes map screenshot](docs/nodes_map_example.jpg)
Map painting but in block game. Contains server plugin and nodes dynmap viewer/editor extension.

**Documentation:** <https://github.com/d-z4/minecraft-nodes/wiki>   
**Editor:** <https://editor.nodes.soy/earth.html>  



# Repo structure
```
minecraft-nodes/
 ├─ nodes/                - Main nodes plugin
 ├─ dynmap/               - Dynmap editor/viewer
 ├─ nodes-squaremap/      - squaremap addon (renders nodes on squaremap)
 └─ squaremap/            - squaremap editor/viewer (port of the dynmap editor)
```



# Build
This repository contains the following separate projects:
1.  Nodes main server plugin
2.  Dynmap viewer/editor
3.  Nodes squaremap addon
4.  Squaremap viewer/editor


## 1. Building main server plugin
Requirements:
- Java JDK 25 (current plugin target java version)

Go inside `nodes/` and run
```
./gradlew build
```
Built `nodes-VERSION.jar` will appear in `build/libs/`.

-----------------------------------------------------------

## 2. Building dynmap viewer/editor
*See internal folder `dynmap/README.md` for more details*

Requirements:
- node.js
- Rust

-----------------------------------------------------------

## 3. Building nodes-squaremap addon
*See internal folder `nodes-squaremap/README.md` for more details*

Requirements:
- Java JDK 25
- squaremap-api 1.3.11 (resolved from the papermc maven repo)

Go inside `nodes-squaremap/` and run
```
./gradlew build
```
Built `nodes-squaremap-0.0.1.jar` will appear in `build/libs/`.

-----------------------------------------------------------

## 4. Building squaremap viewer/editor
*See internal folder `squaremap/README.md` for more details*

Requirements:
- node.js (no Rust needed; the geometry module is a pure-JS port)

Go inside `squaremap/` and run
```
npm install
npm run build
```
Generated files appear in `build/`; copy them into
`plugins/squaremap/web/nodes-editor/`.



# Issues/Todo
See [TODO.md](./TODO.md) for current high-level todo list.



# License
Licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).
See [LICENSE.md](./LICENSE.md).



# Acknowledgements
Special thanks to early contributors:
- **phonon**: making the original plugin
- **Jonathan**: coding + map painting
- **Doneions**: coding + testing + lole
