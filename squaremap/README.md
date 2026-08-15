# squaremap 节点编辑器(为 nodes 插件)

nodes 的 squaremap 网页查看器/编辑器,是 dynmap 编辑器
(`../dynmap/`)的移植版,运行在 squaremap 网页前端之上(而不是 dynmap)。

整体架构:
-   React 负责 UI 布局,地图上的节点是 React 排布的 `svg` 元素;React DOM
    层注入到一个加载 squaremap 瓦片(`/tiles/...`)的 Leaflet 地图上。
-   内部节点地图几何模块(`World` / `IndexSampler`)是 dynmap 编辑器所用
    rust/wasm 模块的**纯 JS 移植**,位于 `src/wasm_main.js`,通过 webpack
    `resolve.modules` 顺序(`squaremap/src` 先于 `dynmap/wasm`)覆盖
    `../dynmap/wasm/wasm_main.js`。**构建/运行 squaremap 编辑器不需要
    Rust 工具链**;`dynmap/` 目录完全不动、仍用其真实 wasm 模块独立构建。
-   UI 默认全中文,并带编辑体验优化(页签文字标签、画笔半径 +/- 按钮等),
    通过 `src/editor/` 的 fork 覆盖实现。

# 环境要求 / 安装
## 环境要求
1. node.js(>= 18)
2. npm

(不需要 Rust / wasm-bindgen —— 见 `src/wasm_main.js`。)

## 安装
1. 下载/安装 node.js 和 npm:<https://nodejs.org/en/download>

2. 安装 npm 包:
```
npm install
```

3. (可选)运行几何模块单元测试:
```
npm test
```

一切正常后,运行生产构建:

```
npm run build
```

会执行 webpack 并在 `/build` 目录生成编辑器文件。

# 开发
1. 在本仓库根目录运行 `npm run dev` 启动 webpack 开发环境
   (webpack-dev-server,端口 80)。
2. 开发服务器会把 `/tiles` 和 `/nodes` 代理到本地 squaremap 服务器
   (`:8080`),这样瓦片和 nodes JSON 都能从运行中的服务器加载。
3. 打开 `http://localhost/nodes-editor/editor.html` 为编辑器页面,
   `http://localhost/nodes-editor/nodes.html` 为只读查看页。

# 发布构建
`npm run build`

1. 对 js/react 执行 webpack(没有 wasm 步骤;几何模块是纯 JS 移植
   `src/wasm_main.js`)。
2. 在 `/build` 目录生成文件。

把生成的所有文件复制到 Minecraft 服务器的 squaremap web 目录:

```
plugins/squaremap/web/nodes-editor/
```

(例如 `build/editor.html` -> `plugins/squaremap/web/nodes-editor/editor.html`,
保持 `css/`、`js/`、`images/` 子目录完整。)

编辑器从 `/nodes/{config,world,towns,ports}.json` 获取 nodes JSON 状态文件;
`nodes-squaremap` 插件(../nodes-squaremap)启动时把它们复制到
`plugins/squaremap/web/nodes/`(`copy-json-to-web: true`),无需手动复制。
注意:
- `world.json` 由本编辑器导出、管理员上传到 `plugins/nodes/world.json`
  (nodes 主插件从不创建它)。
- `config.json`(全球领土费用设置,`meta.type: "config"`)由管理员写在
  `plugins/nodes/config.json`,附属会自动复制到 web 目录。
- `towns.json` / `ports.json` 由 nodes 插件自己写入。
- 资源图标随构建一起发布(`nodes/resource_icons.json` +
  `images/nodes/resources/`),编辑器开箱即用。

然后打开:
- `http://<服务器>/nodes-editor/editor.html` —— 编辑器
- `http://<服务器>/nodes-editor/nodes.html` —— 查看器

# 目录结构
```
build/             - webpack 构建产物(复制到 plugins/squaremap/web/nodes-editor/)
src/
 ├─ squaremap/     - HTML 入口页面 + 全局 css + 静态编辑器资源
 │  ├─ editor.html - 编辑器页面
 │  ├─ nodes.html  - 只读查看页
 │  ├─ css/        - 全局 css
 │  ├─ nodes/      - resource_icons.json(随构建发布)
 │  └─ images/     - 资源图标(images/nodes/resources/)
 ├─ bootstrap.js   - 异步入口,暴露 window.Nodes + window.MapGlue
 ├─ mapGlue.js     - 加载 squaremap 瓦片的 Leaflet 地图(CRS.Simple,
 │                   方块 <-> 经纬度投影,/tiles/settings.json)
 ├─ nodes.js       - dynmap/src/nodes.js 的 fork(替换地图胶水)
 ├─ editor/        - dynmap 编辑器 UI 的 fork(dynmap/src/editor):
 │                   中文 UI、页签文字标签、画笔半径 +/- 按钮;
 │                   panes/ 是翻译后的领土/资源/生成/选项/世界/城镇面板
 ├─ world/         - world.jsx 的 fork(使用 squaremap 投影)
 ├─ wasm_main.js   - rust/wasm 几何模块的纯 JS 移植
 │                   (World + IndexSampler);覆盖 dynmap/wasm
 └─ constants.js   - 从 dynmap 复制
webpack/           - webpack 配置
test/              - wasm_main.js 的 node 单元测试
```

`../dynmap/src/`(共享 React 组件)和 `../dynmap/wasm/`(真实 wasm 模块,
仅供 dynmap 构建使用)会被 webpack 解析,但从不修改。

# 致谢
本编辑器是 dynmap nodes 编辑器(https://github.com/webbukkit/dynmap)
的移植,运行在 squaremap(https://github.com/jpenilla/squaremap)
瓦片与 Leaflet(https://leafletjs.com/)之上。
