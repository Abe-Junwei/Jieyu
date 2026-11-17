---
title: Pixso 设计工作区落地（变量同步、组件库、规范页重拼）
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-11-17
source_of_truth: execution-plan
depends_on:
  - ../../adr/0118-pixso-is-the-design-draft-workspace.md
  - ../../../DESIGN.md
---

# Pixso 设计工作区落地

决定见 [ADR-0118](../../adr/0118-pixso-is-the-design-draft-workspace.md)。Pixso 文件 `va44BZLBUSYRQ7KoiO3PJw`，评审快照在 `.impeccable/critique/`（本地，不进 git）。

## 调研综述

- **同类做法**：Figma/Pixso 社区通行做法是代码 token 生成变量 JSON，再用插件或 API 写入设计文件（Tokens Studio、Style Dictionary 输出 Figma Variables）。Pixso 没有公开的 CI 接口，写入只能经 MCP 的 `write_variables` 或 Plugin API，所以同步由代理触发，CI 只做哈希比对。
- **结论：适配。** 复用 `scripts/build-od-design-tokens.mjs` 已有的「无头 Chromium 读计算值 + 哈希检查」，多输出一份 Pixso 清单。不引入 Tokens Studio（Pixso 不支持该插件格式），也不新增依赖。
- **字体**：Pixso 云端字体里只有 Noto Sans 斜体，没有 Noto Sans Mono 和 Noto Serif SC。本地字体助手 `PixsoLocalFont` 能读本机字体，但只对本机生效（[Pixso 帮助：本地字体](https://pixso.cn/help/guide/36/1672725644819621/)、[常见问题](https://pixso.cn/help/question/1672814020712186/)）。最终选择用云端替身。
- **坑**：
  - 变量绑定必须按「hex + 模式」反查。同一个 hex 在亮暗模式里可能对应不同变量，比如 `#F4F2EC` 既是暗色的 `--fg` 也是暗色的 `--accent`，要按节点所在角色裁决。
  - `code_to_design` 导入会丢行高，输入框里的文字会偏下。
  - 往 auto-layout 父节点插入子节点时，要显式设置 `layoutPositioning`。

## 步骤

### 1. 字体

- [x] 2026-11-17 用户决定不装本地字体助手，改用 Pixso 云端替身（ADR-0118 第 7 条）。替身表是生成脚本里的 `PIXSO_FONT_STANDINS`。
- [x] 4 个 `--font-*` 变量写入 Pixso 并读回一致；Source Han Serif CN SemiBold、Noto Sans SC Regular/SemiBold、JetBrains Mono Medium、Noto Sans SemiCondensed Regular 都能加载。

验证：Pixso 读回变量值和 `loadFontAsync` 结果。

### 2. 变量清单与同步检查

- [x] `scripts/build-od-design-tokens.mjs` 增加输出 `design/jieyu-paper/pixso-variables.json`，内容是 `颜色`（亮色/暗色两个模式）、`尺寸`、`字体` 三个变量集，外加效果样式。
- [x] ~~补上 `--focus-ring`、`--focus-ring-danger` 效果样式~~：Pixso 不渲染阴影扩散值（3 倍导出读像素确认），已从清单删除，焦点环改在组件里画描边环图层。清单现为 85 个变量、6 个阴影样式。
- [x] 删除 `section-y-tablet/phone`、`container-gutter-tablet/phone`、`--text-2xl/3xl/4xl`：从 GROUPS、`design/jieyu-paper/tailwind-v4.css` 和 `components.manifest.json` 里去掉。`src/` 里没有调用方。
- [x] `--radius-xl/2xl/3xl`（都是 8px，同 `--radius-lg`）改名收敛，改了 22 个 CSS 文件和 `scripts/scaffold-ui-surface.mjs`，纯改名，渲染不变。
- [x] `--check` 模式加入清单哈希比对，并验证过手改会被拦下。
- [x] 代理用 `write_variables` 写入 Pixso，删掉 13 个清单外的变量；读回 85 个变量、10 个效果样式，差异为 0。

验证：`npm run build:od-tokens`、`npm run check:docs-governance`、`npm run typecheck`、Pixso 读回差异为 0。

### 3. 文字与效果样式

- [x] 7 个文字样式的字号、行高、字重与 `DESIGN.md` 一致（字体保持替身）。补 `文字/控件`（13/20 600，按钮与标签页）和 `文字/小字`（12/18 400，标签、键帽、提示条次句）。
- [x] 6 个阴影样式保留不动，数值已和 `tokens.css` 一致。

### 4. 组件库（「组件」页）

覆盖 `DESIGN.md` 第 5 节和第 7 节里的通用组件，每个都是组件集，填充、描边、文字、阴影全部绑定：

- [x] 图标：`lucide-react` 的 39 个规范图标做成 16px 组件「图标 / 名称」，描边绑 `--fg`，线宽同代码（1.75/24）。
- [x] 按钮：variant=primary/secondary/danger/ghost，size=default/compact，state=default/hover/active/focus/disabled/busy（48 个变体，`label` 文字属性）
- [x] 图标按钮（`icon` 实例替换属性）、输入框（含 error/readonly/disabled/IME）、文本域、下拉框
- [x] 复选框（含混合态）、单选框、开关：开态按 ADR-0114 用 `--brand` 实心配 `--brand-on`
- [x] 标签家族五种用途：计数徽标、状态片、只读标签、筛选标签、输入标签
- [x] 菜单（菜单项＋分隔线）、Tooltip、Toast（结果／进行中／失败／核实中／常驻）、模态、非模态浮动面板、贴边抽屉。Toast 不挂 `message` 文字属性：Pixso 的文字属性在组件集里所有变体共用一个值。
- [x] 标签页、折叠头、树行、路径、左轨项、列表行、表头和单元格
- [x] 键帽、等宽块、进度条、滑块、加载环（12/16px）、空状态、骨架屏、向导步骤
- [x] 暗色核对：临时画框切「暗色」模式放入各组件实例，颜色全部随变量切换。阴影样式不随模式切换，暗色画板选 `阴影-暗色/…`。

结果：37 个组件或组件集，共 207 个变体。和画板不一致、以 `DESIGN.md` 为准的地方留给第 5 步改：
- 进度条填充用 `--brand`，画板是墨色。
- 图标按钮的切换开态用 `--brand-tint` 底加 `--secondary` 图标，左轨当前项加 2px `--brand` 条，滑块用 2px 轨道和 `--brand` 边拇指（都以 ADR-0114 和 `preview/` 为准）。
- Tooltip 圆角 8px，画板是 4px。

命名规则：组件名写「按钮 / Button」，变体轴和取值对齐 `src/components` 里的实际 props。

验证：`read_components` 列表完整；每个组件集截图核对亮暗两种模式。

### 5. 规范页重拼（「规范」页）

- [x] 01–25 保留原构图（时间轴、IGT 等还没有领域组件，整板换成实例会拆掉这些样例）。纯色按色值绑定变量，文字绑定文字样式，阴影绑定效果样式。暗色专有色值的节点单独钉在「暗色」模式，避免色板的暗色列被亮色模式冲掉。
- [x] 删掉 00c。
- [x] 越档圆角收到 2/4/8/999 并绑定 `--radius-*`（2 是 `--radius-sm`，待决里保留）。内边距 3/7/13/20/36 收到 4/8/12/16/24。字重 700 随文字样式落到 600。
- [x] 时间轴副标题改为「选区用主题浅底，焦点是 1.5px 石墨细环」。00a 里「靛青只给链接和次要标签」改为三档主题色的说法。
- [x] 用组件实例补 07 选择控件、08 标签与切换、09 反馈组件、26 边界样例；00b 底部加一条钉死暗色模式的实例带（阴影换成 `阴影-暗色/…`），00b 加高到 1308。整页一次性脚本会触发 Pixso 网关 504，改成每张画板一个脚本。
- [x] 「取消」的粗黑双框：来自手绘按钮的两道描边叠一块 `__kit_focus` 矩形。00b 这排按钮整排换成按钮组件实例，焦点态用组件里的 1.5px 细环。00b 阴影区「工作面 · 卡片」圆角 8 改 0。
- [x] 补样例落在 26 号画板：复合状态、140% 字号、RTL 内嵌 LTR 时间码、减少动态、灰阶、贴边查看。Pixso 渲染器不做阿拉伯文连写，RTL 样例改用希伯来文（Noto Sans Hebrew，按正文 14/22，不挂文字样式）。
- [x] 焦点环按 ADR-0110 和设计包 `tokens.css` 校正：画板上 18 个输入类 3px 晕从实心 `--fg` 改为图层透明度 14%（错误态 `--danger` 16%），不再和 1px 边糊成黑带；画板 14 个和组件 22 个 1.5px 石墨环改为外扩 2px。贴边内缩的环（标签页、树行、折叠头、单元格）不动。暗色晕规范是 18%，Pixso 图层透明度不分模式，统一用 14%。
- [x] 画板 11/22/24/25 的勾选框和向导完成步骤：文字「✓」「–」换成组件同款 `check` 图标和短横图层，居中；24 号向导完成步骤按 ADR-0119 改 `--brand`。25 号 AI 输入行统一 32px 高、垂直居中。20 号跨轨重叠纹按预览（135°、5px 间距、`--fg` 14%）重画，只铺在两条重叠轨道的重叠区间。
- [x] 22 号两行开关换成「开关 / Switch」实例（原导入图层拇指是圆角方块，「显示 IPA」自动布局错位）；余下一处导入开关拇指改正圆；开关组件 8 个变体去掉默认 10px 左右内边距。25 号第 14 段：声调字母不再折行，错误点与文字留 6px 间距并垂直居中。
- [x] 标签页计数与标签文字基线对齐；13 处 `span.badge` / `button.act` 文字溢出底边改为垂直居中（含提示条「撤销」「重试」「从快照恢复…」「切到主窗口」）；两行「AI 建议」角标行关掉换行（导入时 `layoutWrap=WRAP` + 固定宽，舍入后掉到下一行），全页无同类残留。
- [x] 设计系统页 54 个带底色或描边的小容器（说话人字母圈、计数徽标含暗色条、kbd、IPA 键、chip、分段、向导序号）：文字框撑满容器宽、水平居中、垂直居中。导入时文字框左对齐且比容器宽约 2px，整体右偏 1px、下偏最多 4px。行内 `ins` / `mark` / 表格单元格只偏 1px 左右，未动。
- [x] 状态点：7 处非自动布局的「点 + 文字」（任务进度「核实中」「失败」、表格状态列 4 格、AI 冲突行）点贴字且偏下，统一为点对齐首行中线、间距 8px（与自动布局行一致）。义项列表 1.1 行：出处「录音03 #12」原沿用 IPA 16/24 且框比字窄 2px 折行、与 IPA 重叠，改用正文样式、自适应宽、与 IPA 间距 4px；「例证」「bank」与同行基线对齐。
- [x] 转写人确定度改为「确定度徽标 / CertaintyBadge」组件（16px 圆、状态色浅底＋粗体字形，[ADR-0120](../../adr/0120-transcriber-certainty-as-status-badge.md)）：组件页新增 3 个变体；设计系统页 IGT 行尾 2 处、时间轴片段角标 3 处换成实例，图例改为「徽标＋文字」，规则文案同步。
- [x] 新增「备注徽标 / NoteBadge」组件（16px 文档形，`--brand-tint` 纸面＋`--secondary` 描边）：时间轴选中片段右侧与确定度徽标竖排（上 ✓ 下备注，37px 片段内上下各 2px、间隔 1px），图例加「有备注」（图例间距 16→10 以收进 261px 栅格列）。产品 `NoteDocumentIcon` 现为 `--state-info-solid` 信息蓝，待时间轴重做时改色。
- [x] 审计结果：28 张画板，纯色 4166/4166 绑定，文字样式 1530/1554（余下是时间码与正文混排的富文本和 RTL 样例），越档圆角 0，越档内边距 0，组件实例 50 个。

验证：重新跑评审审计脚本，要求绑定率 100%、越档值为 0、组件实例数大于 0；截图复核。

### 6. 精稿迁移（退役前）

盘点（2026-11-17）：`preview/` 22 页的每个小节在「设计系统」页都有对应画板（`app.html` → 06，`index.html`／`components.html`／`system/kit.html` → 00b，`kit.dark.html` → 00b 暗色条），14:45 的浮层改动也已在 16 号画板。没进 Pixso 的是 Open Design 项目「精稿 · 01 转写工作区」（`jieyu-01-transcription`，在 Open Design 本地数据目录，不在仓库）：

- `index.html`：Stage 4 交互稿，脚本切 9 个样态（standard／empty／dense／fail／saving／unknown／refresh／review／readonly）和 10 个交互（wave／seg／multi／drag 吸附与拒绝／note／ime／locate／leave／keys），同一文档里有 1440 和 1280×720 两个画面。
- `stage2-greybox.html`：Stage 2 灰盒区块草图（1440 展开、1280×720 折叠）。

2026-11-17 用户定：灰盒作 2 帧放「参考」行，不绑定、不换实例；Stage 4 先原样导入，再在 Pixso 里按现行规则改并逐处记录。`code_to_design` 只吃静态 HTML 或 ZIP，脚本切出来的样态要先在浏览器里渲染成静态快照再导入。

- [x] 导出：一次性脚本（放 `/tmp`，不进仓库）用已装的 `@playwright/test` Chromium 打开 `index.html`，逐个点 `data-set-state`／`data-set-ix`，把当时的 DOM（含 `icons.js` 注入的 sprite，去掉脚本和顶部切换条）连同 `tokens.css`、`preview.css` 打成 ZIP，同时存一张 Chromium 截图作对照。实际每 ZIP 装最多 6 帧（约 20 KB base64）。几乎相同的帧（3 个离开守卫）放进同一个 ZIP 时，压缩结果里会有长串重复的 base64，内联传输时被抄坏（`Invalid CEN header`），所以拆成单帧 ZIP，发送前先检查有无重复串。
- [x] 帧清单（24 帧）：1440 × 9 个样态；1440 standard × 9 个交互（wave／seg／multi／note／drag 吸附／drag 拒绝／ime／locate／keys）；离开守卫 × 3（fail／saving／unknown）；窄窗 1 帧（实际 1280×680）；灰盒 2 帧（1440×820、1280×680）。
- [x] 导入：「精稿」页按行排布：第 0 行样态、第 1 行交互、第 2 行离开守卫加窄窗、第 3 行灰盒参考（列 x = c × 1560，行 y = r × 1100），画板名「01 转写 · 样态 · 失败留草稿」这类。导入后统一修字体和文字框：`Noto Sans` 被映射成 Italic Light/SemiBold/Bold，改回替身字体；等宽文字按 6px 每字量宽导致固定框太窄，改为自适应宽，父框随内容收缩；`.wave-zoom` 关掉换行。灰盒只修字体与文字框，不挂文字样式。窄窗侧栏竖排标题（`writing-mode: vertical-rl`）导入成横排，改成 1 字宽定宽框逐字换行，挂着「文字/小字」所以行高仍是 18。
- [x] 绑定：22 张 Stage 4 画板纯色 10463/10463 里有变量的全部绑上（播放头按图层名绑 `--playhead`，不钉暗色模式）。余下 44 处是 `color-mix` 算出来的实色，清单里没有对应变量，保持原色：标尺底 `div.ruler` 22 处（76% `--surface` + 24% `--border-soft`），重叠条底线 `span.ov-strip i` 22 处（22% `--brand` + 78% `--border-soft`）。快捷键输入的占位「查找快捷键」是浏览器默认灰 `#757575`，改绑 `--muted`。文字样式 1235/1235。阴影 64/64。圆角越档 0：滑块拇指和开关点按圆形收到 `--radius-pill`，其余收到 2/4/8。内边距没有 3/7/13/20/36 这几档，未改。
- [ ] 换组件实例：模态、提示条、浮动面板、左轨项、备注徽标。时间轴片段、波形、IGT 没有领域组件，保留导入图层。已换：
  - 键帽 41 个，文字属性读回一致。
  - 图标按钮 226 个，按父级顺序对上图标：加号 42、收起侧栏 21、展开侧栏 1、后退一帧 21、前进一帧 21、循环（选中）22、适应全部 22、适应选区 22、撤销 22、重做 22、关闭 10。
  - 文字按钮 10 个：主按钮、次按钮、危险按钮，紧凑和默认两种高度，标签读回一致。
  - 菜单项 19 个、分隔线 8 条。句段菜单读回顺序是「向前合并、向后合并、选中此句段及之前所有、选中此句段及之后所有、添加备注、确信程度、说话人管理、删除句段」。快捷键挂的是「文字/时间码」（JetBrains Mono），⌘⇧⌫ 不在这套字宽里，文字框只排了约 22px，字形画到了菜单外面。菜单项已收进菜单宽度（右侧留 5px），快捷键改为右对齐、宽 72px。
  - 确定度徽标 51 个：✓ / ≈ / ? 换成 certain / uncertain / not-understood，靠右放在原标记槽里。
  - 播放键是 32px 实心墨底，图标按钮组件没有这个变体，保留导入图层。提示条上的「重试 / 刷新」是 24px 浅字按钮，保存状态按钮带状态点，句段「重试」是下划线文字，说话人标记和概览开关都不是这套组件，也保留。
  - 提示条组件没有逐实例的文案属性，三条提示的正文不同，整块换实例会变成同一句。模态组件的底栏是「取消 / 删除层」，精稿这三帧是离开守卫（放弃改动 / 留下 / 保留草稿并离开）。浮动面板的正文是写死的示例句，精稿是「第 12 段备注」。这三处保留导入图层。这页没有标签页。侧栏是稿件列表行，不是树行。左轨项组件 36px，精稿是 44px，先不换。
- [x] 规则对齐，逐处记录：
  - 激活语段 21 处（含密、低确定、中确定各 1）：去掉导入时多出来的 `--brand-tint` 描边，只留 1px `--fg-2`；删掉被误导入的投影（y=2、模糊 8），改成外扩 3px 的淡墨晕，颜色绑 `--fg`，图层透明度 14%（暗色规范是 18%，Pixso 图层透明度不分模式）。晕的圆角用 8 并绑 `--radius-lg`，几何值是 7，7 不在档位里。
  - 备注：交互「备注」那一帧的激活语段加上「备注徽标 / NoteBadge」，确定度徽标上移到 y=3，备注在 y=20，间隔 1px，都在 38px 行高里。其余帧的句段没有备注，不加。
  - ADR-0119 的向导、标签页、路径这页没有。滑块填充本来就是 `--brand`。
  - 稿件列表的选中行不是激活语段，不套输入焦点。误加的晕已去掉，裁切恢复。
  - 导入图层的文字是顶对齐，设计系统里的居中只在组件上，精稿没换实例的地方不会跟着变。已改：时间框 22 处、提示条动作按钮 5 处、缩放标记 66 处改为垂直居中；「58%」从 12px 高的槽改成 18px 并和滑块中线对齐。底栏键帽换成实例后变宽，盖住了「播放」，已按键帽宽加 4px 重排，组间距 8px。4 块遮罩（3 个离开守卫加快捷键表）导入时把 44% 透明度烘进了实色，绑定又接到了 `--accent`，改绑 `--scrim`，读回透明度 0.44。

验证：每帧 Pixso 导出图与 Chromium 截图并排比对，结构和文字一致（字体替身导致的宽度差除外）；审计脚本在「精稿」页上纯色绑定 100%、越档值 0。

### 7. 文档收口与退役

- [x] 改 `DESIGN.md`：开头的设计包说明、第 10 节，以及字体说明。图标用途清单改为 Pixso 组件页「图标 / *」加产品 `JieyuIcon` 名称表，`DESIGN.md` 里放 39 个图标的用途短表。
- [x] 改 `AI_QUICKSTART.md` 的精稿路由和 `design/jieyu-paper/SKILL.md`。
- [x] 退役 `preview/`，同时清掉 `build:od-icon-sprite`、`check:docs-governance` 里的 sprite 检查、`build-od-design-tokens.mjs` 对 `preview/` 的扫描。依赖 `preview.css` 的 `index.html`、`components.html`、`system/` 与 `manifest.json` 的预览页清单一并去掉。

- [x] 2026-11-17 精稿快捷键：速查表一键一帽；菜单右列用 Inter 符号（⌃⌥⇧⌘，Home／End 为 ↖／↘）。⌫ 不用 Fira Sans，那是实心键。热点和流程说明在「精稿」页，连线仍在原型面板手设。用户核对过速查表和句段菜单。

验证：`npm run check:docs-governance`、`npm run report:docs-link-debt`。

## 待决

- 2026-11-17 定：控件圆角只有 4px。`--radius-xs` 与 `--radius-sm` 改为 4px，与 `--radius-md` 同值。不收成 0，也不保留 2px 档。
