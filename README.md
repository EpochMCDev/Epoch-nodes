# Minecraft nodes 插件

![Nodes map screenshot](docs/nodes_map_example.jpg)

在方块游戏里画地图。包含服务器插件与 nodes 的 dynmap 查看器/编辑器扩展,
以及配套的 squaremap 附属与编辑器。

**文档:** <https://github.com/d-z4/minecraft-nodes/wiki>   
**编辑器:** <https://editor.nodes.soy/earth.html>  



# 仓库结构
```
minecraft-nodes/
 ├─ nodes/                - nodes 主插件
 ├─ dynmap/               - dynmap 编辑器/查看器
 ├─ nodes-squaremap/      - squaremap 附属(把 nodes 渲染到 squaremap)
 └─ squaremap/            - squaremap 编辑器/查看器(dynmap 编辑器的移植)
```



# 构建
本仓库包含以下几个独立项目:
1.  nodes 主服务器插件
2.  dynmap 查看器/编辑器
3.  nodes squaremap 附属
4.  squaremap 查看器/编辑器


## 1. 构建主服务器插件
要求:
- Java JDK 25(当前插件目标 Java 版本)

进入 `nodes/` 并运行
```
./gradlew build
```
构建产物 `nodes-VERSION.jar` 出现在 `build/libs/`。

-----------------------------------------------------------

## 2. 构建 dynmap 查看器/编辑器
*详见内部目录 `dynmap/README.md`*

要求:
- node.js
- Rust

-----------------------------------------------------------

## 3. 构建 nodes-squaremap 附属
*详见内部目录 `nodes-squaremap/README.md`*

要求:
- Java JDK 25
- squaremap-api 1.3.11(从 papermc maven 仓库解析)

进入 `nodes-squaremap/` 并运行
```
./gradlew build
```
构建产物 `nodes-squaremap-0.0.1.jar` 出现在 `build/libs/`。

-----------------------------------------------------------

## 4. 构建 squaremap 查看器/编辑器
*详见内部目录 `squaremap/README.md`*

要求:
- node.js(不需要 Rust;几何模块是纯 JS 移植)

进入 `squaremap/` 并运行
```
npm install
npm run build
```
生成文件出现在 `build/`;把它们复制到
`plugins/squaremap/web/nodes-editor/`。



# 问题/待办
当前高层待办列表见 [TODO.md](./TODO.md)。



# 许可
基于 [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html) 许可。
见 [LICENSE.md](./LICENSE.md)。



# 致谢
特别感谢早期贡献者:
- **phonon**: 制作原插件
- **Jonathan**: 编码 + 画地图
- **Doneions**: 编码 + 测试 + lole
