# 代码结构与维护边界

本仓库分为评测控制器和静态结果页面。前者负责产生可信结果，后者只读取结果、排序和展示；
浏览器不重新计分，不连接学校服务器，也不触发算法运行。

## 1. 从哪个模块开始读

| 模块 | 职责 | 不应负责 |
| --- | --- | --- |
| `src/rcabench_leaderboard/cli.py` | 参数定义、命令路由、统一错误出口 | 训练、计分细节 |
| `commands/checks.py` | 配置校验、注册表校验、doctor | 调度评测 |
| `commands/datasets.py` | 下载与数据适配的命令入口 | 修改算法行为 |
| `commands/benchmark.py` | 编排 prepare / run / evaluate | 实现指标公式 |
| `commands/common.py` | 算法查找、完整 manifest 校验与 limit 选择 | 文件覆盖、数据修复 |
| `commands/publishing.py` | 编排 record / build-site | 修改已计算指标 |
| `config.py`, `datasets.py`, `ops_lite.py` | 注册配置、数据路径、数据格式适配 | 前端展示 |
| `prepare.py`, `runner.py` | 训练资产缓存、单 case Docker 执行与恢复 | 页面状态 |
| `evaluation.py` | 统一计分与质量门禁 | 下载、HTML 渲染 |
| `records.py` | 晋升最新指标、同步静态 JSON | 重新计分 |

`commands/` 位于 `src/rcabench_leaderboard/` 下。公开命令、参数默认值、输出 JSON 和失败
退出码保持兼容；`python -m rcabench_leaderboard.cli` 与已安装的 CLI 使用同一入口。

## 2. 前端职责

| 文件 | 职责 |
| --- | --- |
| `site/index.html` | 语义化页面、加载占位、评测协议、导航 |
| `site/app.js` | 加载入口、事件绑定、状态更新和渲染调度 |
| `site/lib/leaderboard.js` | v1/v2 数据适配、列定义、最新记录、搜索、scope 筛选、排序 |
| `site/lib/location.js` | URL 参数读取与写回；兼容已有分享链接 |
| `site/lib/format.js` | 百分比/秒数/日期、HTML 转义、归档链接 |
| `site/lib/view.js` | 将数据和状态渲染为 DOM；维护排序高亮和可访问状态 |
| `site/styles/base.css` | 颜色、字体、通用元素、键盘焦点、减少动态效果 |
| `site/styles/layout.css` | Atlas 风格首页、说明区与移动端排版 |
| `site/styles/leaderboard.css` | 数据集切换、筛选栏、表格、高亮、窄屏滚动 |

视觉语言来自 [Benchmark Atlas](https://hamsterstation.github.io/benchmark-atlas/)：米白纸面、
墨绿面板、衬线标题和细边框。只沿用视觉设计，没有引入论文索引的数据模型或 Astro 构建依赖。

浏览器加载 `site/data.json`，默认按 MRR 降序。点击表头或更改排序选择器后，高亮跟随当前
排序列；首次选择耗时列按升序。无值或非有限数值显示为 `—`，在正反排序中都放到末尾。
其他指标仍使用原始数值比较，显示时才四舍五入为百分比或秒数。

URL 参数为 `benchmark`、`q`、`scope`、`sort`、`direction`。更换数据集保留搜索和排序条件，
“重置”保留当前数据集、清空筛选并恢复 MRR 降序。方向键/Home/End 可切换数据集标签，
窄屏表格横向滚动时算法名称列固定。加载失败显示重试入口，不显示伪造的空榜或零分。

## 3. 怎么开发和验证

在仓库根目录、已安装 Python 开发依赖和 Node.js 22+ 的环境中：

```bash
ruff check .
pytest -q
rcabench-leaderboard validate-registry
rcabench-leaderboard build-site
npm run check
npm test
python -m http.server 8765 --bind 127.0.0.1 --directory site
```

打开 `http://localhost:8765/`。ES modules 与 `fetch` 需要 HTTP，不使用 `file://`。
没有 npm 依赖，无需 `npm install`。`npm test` 使用 Node 内置测试运行器。

- 改颜色或字体：先改 `base.css` 的设计变量；改表格不必动首页布局。
- 增加展示指标：在 `leaderboard.js` 的 `SORT_COLUMNS` 中定义键、标签、格式和默认方向，
  表头、选择器和数据列会复用同一份定义。计分协议变更需要单独审查，不能只改展示层。
- 新增命令：在对应 `commands/` 模块实现编排，在 `cli.py` 注册参数，并补 CLI 合约测试。
- 新增数据集：沿用数据集 PR 流程。当前归档目录为 `fse` / `ops-lite`；新数据集应在
  `format.js` 明确对应的归档目录并补链接测试，未知目录不会自动错误地指向 OPS-Lite。
- 更新榜单数据：由正式评测和 `record` 命令完成，不手改 `site/data.json`。

CI 在云端运行 Python 测试、Ruff、注册表校验、静态数据同步、JS 语法检查与前端单元测试。
前端测试覆盖旧数据格式、去重、排序、缺失值、组合筛选、URL 往返、输出转义，以及已发布
记录和本地历史归档的一致性。CLI 测试使用临时文件和 mock，不运行 Docker 或下载全量数据。

手动浏览器回归需检查桌面和窄屏、两套数据集、正反排序高亮、组合筛选与空结果、链接刷新、
加载失败重试、键盘切换标签。此类浏览器检查和算法 smoke / 全量评测是不同层次的验证。

## 4. 重构不得改变的边界

- 指标分母、服务去重、多根因命中、质量门禁、算法 scope 和容错阈值不变。
- 镜像、固定 commit、数据 revision、划分、模型、epoch、映射和 fallback 不变。
- `result.json` 的存在性跳过逻辑不变；已有文件由 evaluate 阶段验证，不在恢复时重写。
- 历史 metrics、结果、原始数据、HF cache、checkpoint、smoke 和恢复日志全部保留。
- `build-site` 仍只把 `results/leaderboard.json` 同步为 `site/data.json`，不会覆盖前端模块。
- PR 信任边界和 self-hosted 调度不变；前端测试不需要 secrets 或学校服务器访问。

页面发布仍由 `pages.yml` 将完整 `site/` 目录部署到 GitHub Pages，没有增加 API、数据库或
常驻 Web 服务。本地 UI 重构本身不触发服务器评测或线上发布。
