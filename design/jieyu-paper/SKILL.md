# 使用纸本田野笔记（Open Design 设计系统与通用精稿规程）

在 Open Design 中新建或修改解语任何桌面页面的精稿时（每个工作区另起独立原型项目并绑定 `user:jieyu-paper`，严禁直接改动设计系统包 `ds-jieyu-paper`）：

## 一、设计系统硬复用铁律（零手抄、零私造）

1. **物理复用底座**：先读 [`DESIGN.md`](DESIGN.md)，完整引入 [`tokens.css`](tokens.css)（含 `:root` 与 `[data-theme="dark"]` 全量定义）、[`preview/preview.css`](preview/preview.css) 原子类与 [`preview/icons.js`](preview/icons.js) 图标 sprite。严禁手抄残缺 `:root` 子集，暗色态直接靠根节点 `data-theme="dark"` 原生切换。
2. **母件认领拼装**：对照 [`system/index.html`](system/index.html) 下的 22 张预览页移植已有 DOM 结构与类名（壳层 `components-shell`、桌面菜单/设置 `components-desktop`、时间轴 `components-timeline`、播放编辑 `components-media`、转写行 `app`、行间注释 `components-igt`、专业查询 `components-query`、导入导出 `components-tasks`、AI 队列 `components-ai`、浮层 `components-overlays`、反馈 `components-feedback` 及 `buttons`/`inputs`/`forms`/`tags`/`navigation`/`data`）。页面 `<style>` 只写页面级 Grid/Flex 布局骨架；发现母件缺口先报「设计系统差额」，禁止私自生造新控件变体。
3. **图标唯一性**：只用 `<svg class="i"><use href="#name"/></svg>`（左轨与空态加 `.lg`），名称以 [`preview/icons.html`](preview/icons.html) 登记为准；禁止手绘 `<path>` 或拿 Unicode 字符充当交互图标。
4. **尺度与层级硬禁令**：
   - 页面样式禁止出现裸 `#hex` / `rgb()` 色值或写死的 `font-size: Npx`；字号仅限 `--text-xs..xl`（6 档，最小 12px，IPA 16/24）。
   - 组件内间距只用 `4 / 8 / 12 / 16 / 24 / 32px`（禁用 `6 / 10 / 20px`）；`40 / 48 / 64px` 仅给页面级留白。
   - 同一视觉路径最多 **2 层**带 `1px` 边框的容器（Shell → 分栏），第 3 层起只靠 `--surface-warm` 底色或间距区分；工作面、面板、卡片不加投影，阴影三档只给浮层，模态遮罩用 `--scrim`。
   - 墨色承载正文、主按钮（如播放）、跨层伴随对齐段（`--selection`）与波形播放头；独立控件焦点用 1.5px 石墨细外环 `--focus-color`，输入焦点用次墨单边 + `--focus-ring` 淡墨晕；主题色按三档分工：`--brand`（配 `--brand-on`）给复选框／单选／开关开态、进度条、滑块填充轨、左轨 2px 边条与选中事件点，`--brand-tint` 给左轨当前槽底、波形选区、当前激活语段底（外框同输入焦点：4px 圆角、1px 次墨边、淡墨晕）、检索命中词底、工具切换 `aria-pressed="true"` 与筛选标签 `aria-checked="true"` 浅底，`--secondary` 给选区内波峰、概览视窗框、拖边吸附线、上述浅底文字／图标、带下划线链接与次要标记；红色只表示失败；说话人轨与层联动线用 `--series-ink-*` 深浅 + 线型 + 字母标记，不用彩色。
   - 示例语料统一使用虚构卡朗语，禁用真实田野语料，不加感叹号。

## 二、全页面通用五步精稿流程（逐关过审，不跳步）

1. **Stage 1 · 调研分流与母件认领**：盘点现有 Web 页面设计与主路线图/ADR，分出「桌面本片交付 / Web 遗留剔除 / 第二程延期留槽」三栏，明确核心操作闭环、键盘流，并为每个 UI 成分认领 `preview/*.html` 母件 → **经用户范围评审**。
2. **Stage 2 · 双视口灰盒区块草图**：基于 `components-shell.html` 交付 `1440×1000` 主视口与 `1280×720` 窄窗折叠态线框，标明尺寸预算与 2 层边框边界，不画假细节 → **经用户结构评审**。
3. **Stage 3 · 逐区块全样态深化**：用 `jieyu-paper` 真件与虚构卡朗语极端数据（超长多语/IPA 混排、极窄/深层嵌套、空态、保存中/结果未知/失败留草稿/落库成功刷新失败/待复核/只读锁死、亮暗双态）逐块拼装并合成整页主稿，先过零裸色值/零野字号/零手绘图标自检 → **经用户视觉与完备度评审**。
4. **Stage 4 · 组件微交互与浮层收口**：落地右键菜单（单选/多选）、拖拽/吸附/阻断就近提示、IME 防穿透、离开守卫、快捷键与浮层 Esc 焦点归还、跨页定位衔接 → **经用户体验评审**。
5. **Stage 5 · 代码映射封板**：输出「区块 → Web 复用组件 → 受控 Props → CSS owner → `desktopCall` / Query key」映射表写入切片 SDD `design.md`，解锁产品代码实施（HTML 仅作视觉参考，不直接进 `src/`）。

`tokens.css` 由仓库 `src/styles/tokens.css` 生成（`npm run build:od-tokens`），不要手改；`tailwind-v4.css`、`colors_and_type.css` 只引用 `tokens.css`。
