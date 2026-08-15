# nodes-squaremap(nodes 的 squaremap 附属插件)

把 nodes 插件状态(领土、资源节点、港口)渲染为 squaremap 网页地图上的标记。
是 `nodes` 主插件的配套附属,并与 `../squaremap/` 的 squaremap 网页编辑器配合使用。

整体架构:
- **纯文件耦合**:定时(默认 100 ticks = 5 秒)轮询 nodes 插件的 JSON 状态文件
  (`plugins/nodes/world.json` / `towns.json` / `ports.json`),
  **文件变化才重建标记**;不依赖不稳定的 nodes 插件 API,也不写回任何数据。
- **领土边界算法**:由领土区块集合(块网格)计算边界环(TerritoryOutline 算法),
  支持孔洞 / 嵌套 / 对角相触区域,与编辑器 `wasm_main.js` 的
  `getTerritoryBorder` 语义一致。
- **Nodes 图层**:在每个启用的 squaremap 世界注册 "Nodes" 图层,包含:
  领土多边形(按城镇/国家着色,被占领领土用占领者颜色描边)、程序生成的
  节点图标、港口图标、城镇/国家名称文字精灵。
- **节点详情(hover)**:解析 `world.json` 里的资源类型定义(`nodes` 对象:
  icon / income / ore / crops / animals)。在 squaremap 地图上**悬停资源节点
  图标**会显示该资源的完整详情(中文标签:收入 / 矿物 / 作物 / 动物 + 数值),
  与网页编辑器侧栏的资源详情一致;**悬停领土**显示名称/归属 + 该领土的
  资源节点列表。
- **JSON 复制**:启动时把 4 个 JSON(world/towns/ports/config)复制到
  `plugins/squaremap/web/nodes/`,供 squaremap 网页编辑器通过 HTTP 读取。

# 环境要求
1. Paper 26.2+ 服务器(api-version 26.2)。
2. squaremap 插件 1.3.11+(`depend: [squaremap]`)。
3. nodes 插件写入 `plugins/nodes/*.json`
   (world.json / towns.json / ports.json)。

# 构建
```
cd nodes-squaremap
./gradlew build
```
产物在 `build/libs/nodes-squaremap-0.0.1.jar`。

运行单元测试(TerritoryOutline 算法):
```
./gradlew test
```

# 安装
1. 把 `build/libs/nodes-squaremap-0.0.1.jar` 复制到服务器 `plugins/`
   目录(squaremap 必须已安装并启用)。
2. 重启服务器(或在有 squaremap 的情况下 `/reload confirm`)。
3. 附属会按间隔(默认 100 ticks = 5 秒)读取 `plugins/nodes/*.json` 并
   在 squaremap 世界上渲染标记。

打开 squaremap 网页,勾选 "Nodes" 图层查看。

# 配置(`config.yml`)
| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `data-directory` | `plugins/nodes` | nodes 插件 JSON 文件所在目录 |
| `update-interval` | `100` | 两次 mtime 检查之间的 tick 数 |
| `world` | `auto` | `auto` = 所有已启用 squaremap 世界;或世界名列表 |
| `copy-json-to-web` | `true` | 把 JSON 复制到 `<squaremap-web>/nodes/` 供网页编辑器使用 |
| `icon-size` | `16` | 节点/港口图标标记的像素尺寸 |
| `text-size` | `20` | 城镇/国家名称文字精灵的像素高度 |
| `render.*` | | 领土、仅边界模式、节点图标、港口、城镇/国家名等渲染开关 |
| `unowned-color` | `[80,80,80]` | 无城镇领土的填充色 |
| `fill-opacity` | `0.35` | 领土多边形填充不透明度 |
| `stroke-weight` | `2` | 领土边界描边像素宽度 |
| `border-color` | `[40,40,40]` | 领土边界颜色 |
| `icons.<type>` | | 生成某类节点图标所用的 RGB 颜色 |

注意:squaremap 自身的 `settings.web-directory.auto-update` 会在启动时覆盖
自己的 web 文件;本附属在 squaremap 启用**之后**才复制 JSON,所以副本不受
影响。网页编辑器文件(`/nodes-editor/`)是静态文件,需要手动复制(或自行
部署)——参见 `../squaremap/README.md`。

# 目录结构
```
src/main/java/phonon/nodes/squaremap/
 ├─ NodesSquaremapPlugin.java - 主插件类(onEnable 复制 JSON 到 web)
 ├─ NodesData.java            - JSON 状态解析(world/towns/ports + 资源定义)
 ├─ Settings.java             - config.yml 读取
 ├─ TerritoryOutline.java     - 区块集合 -> 边界环算法
 └─ SquaremapRenderer.java    - squaremap 图层/标记注册(含节点详情提示)
src/test/.../TerritoryOutlineTest.java - 算法单元测试
src/main/resources/plugin.yml - name: nodes-squaremap, depend: [squaremap]
src/main/resources/config.yml
```

# 致谢
基于 squaremap 构建:https://github.com/jpenilla/squaremap
(squaremap-api 1.3.11, https://repo.papermc.io)。
