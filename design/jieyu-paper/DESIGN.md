---
name: 解语 Jieyu Studio
description: 濒危语言田野工作台 — 纸本田野笔记，白纸墨色，靛青只作次要标记
category: Productivity & SaaS
colors:
  action-solid: "#111111"
  action-hover: "#000000"
  action-active: "#000000"
  action-solid-dark: "#F4F2EC"
  text-on-action: "#FFFFFF"
  text-on-action-dark: "#0C0C09"
  theme-accent-solid: "#111111"
  theme-accent-hover: "#3A3A3A"
  theme-accent-active: "#000000"
  theme-accent-tint: "#F5F5F5"
  theme-accent-text: "#111111"
  theme-accent-solid-dark: "#F4F2EC"
  focus-accent: "#111111"
  focus-accent-dark: "#F4F2EC"
  mark-secondary: "#312C85"
  mark-secondary-dark: "#B6B2F2"
  chrome-rail-bg: "#FFFFFF"
  chrome-rail-active: "#F5F5F5"
  chrome-rail-bg-dark: "#0C0C09"
  surface-canvas: "#FAFAFA"
  surface-panel: "#FFFFFF"
  surface-header: "#FFFFFF"
  surface-elevated: "#FFFFFF"
  surface-canvas-dark: "#0C0C09"
  surface-panel-dark: "#161614"
  surface-header-dark: "#161614"
  text-primary: "#111111"
  text-secondary: "#3A3A3A"
  text-tertiary: "#5C5C5C"
  text-on-accent: "#FFFFFF"
  text-on-chrome: "#111111"
  border-subtle: "#EEEEEE"
  border-soft: "#E2E2E2"
  border-strong: "#C8C8C8"
  border-control: "#949494"
  border-control-dark: "#6A675F"
  state-success-solid: "#16A34A"
  state-success-text: "#166534"
  state-warning-solid: "#D97706"
  state-warning-text: "#92400E"
  state-danger-solid: "#DC2626"
  state-danger-text: "#B91C1C"
typography:
  main-h:
    fontFamily: "Noto Sans, Noto Sans SC, PingFang SC, Noto Sans Arabic, Noto Sans Devanagari, Noto Sans Thai, Noto Sans Tibetan, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  sub-h:
    fontFamily: "Noto Sans, Noto Sans SC, PingFang SC, Noto Sans Arabic, Noto Sans Devanagari, Noto Sans Thai, Noto Sans Tibetan, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  body-reg:
    fontFamily: "Noto Sans, Noto Sans SC, PingFang SC, Noto Sans Arabic, Noto Sans Devanagari, Noto Sans Thai, Noto Sans Tibetan, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
  meta-tool:
    fontFamily: "Noto Sans, Noto Sans Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  ipa-display:
    fontFamily: "Noto Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  code-time:
    fontFamily: "Noto Sans Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
rounded:
  none: "0px"
  control: "4px"
  menu: "8px"
  dialog: "8px"
spacing:
  micro: "4px"
  tight: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  page-sm: "40px"
  page-md: "48px"
  page-lg: "64px"
  rail: "52px"
components:
  button-primary:
    backgroundColor: "{colors.action-solid}"
    textColor: "{colors.text-on-action}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 16px"
  button-primary-compact:
    backgroundColor: "{colors.action-solid}"
    textColor: "{colors.text-on-action}"
    rounded: "{rounded.control}"
    height: "28px"
  input-default:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    height: "32px"
  chrome-rail:
    backgroundColor: "{colors.chrome-rail-bg}"
    textColor: "{colors.text-on-chrome}"
    width: "52px"
---

# 解语 UI 规范

本文件只规定视觉、组件、交互表达与桌面适配。产品流程样例可作参考；查询语言、存储、并发、文件事务、发布范围等工程规格以后另定，不作为本轮 UI 规范完成门槛。

> 2026-11-16 起，默认外观是 Open Design 里定下的「纸本田野笔记」（[ADR-0103](../../docs/adr/0103-paper-field-notes-is-the-only-appearance.md)）。旧的多套配色不再可用。Penpot 板号只作历史引用。与风格无关的工程规则（ADR-0101 第 4 条）保留。

设计系统只有一套，在 `design/jieyu-paper/`：本文件是正文（根目录 `DESIGN.md` 是指向它的软链接），`preview/` 是组件预览页，`tokens.css` 由 `npm run build:od-tokens` 从 `src/styles/tokens.css` 生成、不手改。Open Design 通过软链接直接读这个目录（[ADR-0106](../../docs/adr/0106-design-system-package-lives-in-repo.md)）。

历史设计源为 Penpot「解语 · UI 规范」00–17，板号只作出处引用；颜色与尺寸以 `src/styles/tokens.css` 为准。UI 规范描述目标表达，不声明现有组件或运行行为已全部实现。

## 1. 视觉语言与布局

冷静、紧凑、适合长时间对照波形与标注。白纸放在浅灰书桌上，导航轨与纸面同色，墨色文字。工作区平铺，面板相接无缝隙；禁止全宽顶部导航与层层卡片堆叠。

- 页面头部只服务所属工作区，不横跨导航轨。
- 上下文栏约 216–272px；检查器约 280–360px；主编辑区建议至少 680px。
- 收窄先收检查器，再收上下文。保留明确重开入口，原选择、编辑位置与焦点返回关系不变。
- 矮窗口按分区独立纵向滚动；字体放大时允许文字换行与容器增高，不裁关键操作。领域长内容可整组横滚，禁止各行错位滚动。
- 主画布像素布局由页面设计另定；UI 规范约束其视觉角色、控件与状态，不替代完整页面稿。

## 2. 颜色角色

**主操作、选中、焦点分开。**

- 主操作 `action-*`：亮色 solid `#111111`，hover / active `#000000`，文字 `#FFFFFF`。暗色实心 `#F4F2EC`，文字 `#0C0C09`。
- 选中 `theme-accent-*`：亮色 tint `#F5F5F5`、文字 `#111111`；暗色 tint `#242320`、文字 `#F4F2EC`。只表达行、标签页、片段或对象的选中，不当普通卡片底。
- 时间轴片段选中底 `--timeline-selection-bg` 比悬停深一档：墨色 8% 混入纸面（亮色 `#ECECEC`，暗色 `#282825`），悬停仍用 tint；左侧墨条保留。
- 焦点 `focus-accent`：亮 `#111111`，暗 `#F4F2EC`。2px 外环，离控件 2px；不用于主按钮填充，也不用靛青。
- 次要标记 `mark-secondary`：亮 `#312C85`，暗 `#B6B2F2`。只给链接和次要标签。
- 工作面 / 面板：亮 `#FAFAFA` / `#FFFFFF`，暗 `#0C0C09` / `#161614`。
- 正文 / 次级 / 辅助：亮 `#111111` / `#3A3A3A` / `#5C5C5C`，暗 `#F4F2EC` / `#C8C4BA` / `#8E8A82`。
- 分隔线用 border-subtle / soft；控件可操作边界（输入类控件、复选框、单选框、带边按钮）用 border-control（亮 `#949494`，暗 `#6A675F`；悬停加深到次级文字色，禁用退回 border-soft；转写工具栏与对话框关闭按钮保持无边框，[ADR-0108](../../docs/adr/0108-control-border-contrast-3-to-1.md)）。不拿浅分隔线充当控件边界。
- 导航轨使用 chrome-rail-*，与纸面同色，文字用正文色。
- 语义 solid / text 分开：成功 solid `#16A34A`、文字亮色 `#166534`、暗色 `#4ADE80`；警告 solid `#D97706`、文字亮色 `#92400E`、暗色 `#FBBF24`；错误 solid 亮色 `#DC2626`、暗色 `#F07171`。正文不直接使用未达对比度的 solid 色。没有第四种语义蓝色；一般信息提示用中性浅灰底或墨色壳加墨点（[ADR-0109](../../docs/adr/0109-design-system-no-info-blue-noto-ipa-and-menu-target.md)）。

语义状态同时给图形／色点与文字。Toast 使用墨色壳 + 色点，Chip 使用中性壳 + 色点；内联反馈可以使用浅语义底。只有这一套外观，设置里只切换亮色、暗色或跟随系统。

## 3. 字体与排版

- UI：Noto Sans / Noto Sans SC；主标题 20/28、分组标题 16/24、正文 14/22、工具与说明 13/20。需要衬线时用 Noto Serif / Noto Serif SC。
- IPA / IGT / 例句：统一使用 Noto Sans（`--font-ipa: 'Noto Sans', sans-serif`，不用 Charis SIL）；默认 16/24，内容展示可在 14–18px 范围调整并保持足够行高。不得用于按钮、菜单、导航和 UI 标题。界面、衬线、等宽与 IPA 所用的 Noto 字体全部随应用打包，不从网络加载（[ADR-0109](../../docs/adr/0109-design-system-no-info-blue-noto-ipa-and-menu-target.md)）。
- 时间码与参数：Noto Sans Mono / ui-monospace；12/18，固定 LTR。
- 只有这 6 档（20、16、14、13、12，加 IPA 16），全部随设置里的字号缩放。最小 12px；面板里旧的 9–11、15、18、22px 已并入相邻档（[ADR-0104](../../docs/adr/0104-type-space-shadow-and-ink-only-series.md)）。
- 附标、声调、送气和长音符号不得截顶压底。字族回退仍需保证可读，不用额外空格弥补字体或对齐问题。
- 长名称单行省略时须有完整内容查看方式；不省略错误原因、状态和关键动作。正文优先换行，不能用省略号隐藏必须阅读的信息。

## 4. 间距与形状

4px 步进，优先 8px 节奏。组件内部只用 4 / 8 / 12 / 16 / 24 / 32px；40 / 48 / 64px 只给页面级留白。不用 20、10、6px 这类非步进值，行内边距取 8 或 12。正文和控件间距 12–16px，独立分组间距 24px。

- 工作面圆角 0；菜单、提示和对话框 8px；控件 4px。
- 按钮默认 32px、紧凑 28px；单行输入默认 32px、紧凑不低于 28px。领域编辑单元可随字号与内容增高。
- 图标统一使用 Lucide（`lucide-react`）轮廓风格，经由 `JieyuIcon` 入口；默认 20px，紧凑伴随文字可用 16px；图标与文字间距 8px，不混用彩色 emoji。命中优先 28×28，最低 24×24；时间轴细手柄例外见领域模式。
- 列表／表格默认行高 36–44px，密度一致；不要单凭缩小字形制造紧凑感。
- 工作平面、面板和卡片不加投影。浮层用发丝边加三档阴影之一：`--shadow-popover`（菜单、Tooltip）、`--shadow-float`（层操作、备注等浮动面板）、`--shadow-modal`（模态）。焦点环用 `--shadow-focus`，不手写 box-shadow。最多两层可见容器边框，内层用间距和底色分组。

## 5. 组件与通用状态

### 按钮

实样覆盖默认、悬停、按下、键盘焦点、禁用、处理中。主要、次要、危险为三种语义层级；同一操作组至多一个主要操作。危险按钮用危险文字与上下文，不把整组动作涂红。

按钮用动词；处理中保留宽度并说明动作，不因文字变化挤动相邻项。禁用时仍能找到原因。文字按钮与图标按钮也必须有悬停、焦点和可理解名称。

### 输入与表单

永久标签、输入区、帮助／错误区分开；占位符不代替标签。默认、悬停、焦点、错误、只读、禁用与 IME 输入中分别呈现。

错误保留原内容，给具体原因与修正方式，不能只变红。只读允许选择复制，禁用表示当前不可操作。帮助和错误占布局空间，不覆盖下一字段。IME 组合期间 Enter 不穿透为提交、播放或切换。

### 选择控件

复选用于多选，单选用于互斥，开关用于即时启停；开关旁功能名稳定，不随开关变成两个不同动作。复选混合态使用短横，不伪作全选。选择控件的悬停、焦点、禁用表达沿用通用规则；错误在组标题／说明处给出，不只给某个选项涂红。标签是状态说明，可移除标签有独立删除命中；可筛选标签必须具备选中／悬停／焦点实样。

### 导航、标签页与列表

位置与操作分开。当前项用中性背景和位置标识；悬停不能替换当前项，焦点离开不移除选择。排序表头给方向，行内菜单独立命中。导航缩写／图标可查看完整名称。

### 浮层

菜单、Tooltip、模态、非模态检查器分别使用。模态遮罩用 `--scrim`（`color-mix(--shadow-color 44%)`，亮暗同值）；非模态不铺全页遮罩。Tooltip 不承载必须点击的操作；模态锁定焦点，非模态不锁整个工作面。Esc 只处理最上层可关闭层，关闭后返回原触发控件。悬停与小控件过渡 160ms（`--duration-fast`），浮层进入／退出 200ms（`--duration-normal`）；减少动态时去掉位移与非必要动画。存在未处理输入时不得通过遮罩点击静默丢弃。

### 数据表格与字段组

词典列表、查询结果、导入预览共用一种表格：表头 36px、行 40px；数字右对齐等宽；研究内容用 IPA 字族。单元格焦点是墨色内框，双击或 Enter 就地编辑、Esc 还原。列宽可拖，分隔线命中 9px。截断、过期、失败写在表格上方或下方，不只靠颜色。

可重复字段组（义项、例证、反查）：子级缩进 28px，用浅底不用边框。拖动把手或上移／下移按钮排序，升降级用按钮，到头时禁用；拖动时画墨色插入线。引用用次要标记色下划线；失效引用删除线加原因，可迁移或解除。前后对照：删去用灰色删除线，新增用浅灰底加墨色下划线，不用红绿。

### 树、路径与分隔线

树每级缩进 16px，→ 展开或进子级，← 收起或回父级，行内「⋯」悬停或焦点时出现、内容与右键菜单一致。路径只用在跨层级跳转（引用、查询结果、词条出处），末项是当前位置、不可点，过长从中间折叠。面板分隔线可视 1px、命中 9px，拖动时墨色 2px；上下文栏收起后留 32px 重开条，写当前位置。

### 向导与长任务

向导步骤：已完成实心墨圈，当前墨边加粗，未到灰边；有阻断项时当前步骤用错误边加「!」和数量。可回到已完成步骤，不能跳过未完成步骤。导出先列会丢失的内容和数量，再列完整保留的。长任务给计数和取消；失败写清项目有没有被改动；写入结果不能确认时说明正在核实，不显示完成。回收站写剩余天数和引用影响，永久删除另行确认。

### 桌面外壳

窗口标题栏和菜单栏用系统原生。完整应用菜单（文件、编辑、播放、片段、视图、窗口、帮助）是桌面版目标规格：工具栏上的每个动作在菜单栏里都能找到，快捷键两处一致，以 `KeybindingService` 默认值为准；⌘M 是「与后一句合并」，窗口菜单的「最小化」不带快捷键；不可用项置灰不隐藏（当前 Electron 骨架期仅先按 [ADR-0107](../../docs/adr/0107-motion-compact-height-selection-and-shortcuts.md) 让出 ⌘M，完整动作与置灰同步随各工作区切片落地，见 [ADR-0109](../../docs/adr/0109-design-system-no-info-blue-noto-ipa-and-menu-target.md)）。工具栏分前段（编辑历史）、中段（视图）、后段（保存状态与「更多」），变窄时从中段收起，保存状态最后收。设置左侧分类、右侧即时生效，没有「应用」按钮；影响数据的设置单独确认。首次打开只有一个主要操作；找不到的最近项目给重新定位，不删除。拖放永远有等价的「选择文件…」，不接受的类型在松开前说明。

### 反馈

空状态说明原因并给至多一个主要下一步；Skeleton 保留结构，加载文字说明当前状态；确定进度显示百分比，不确定进度不伪造数值。

未保存／保存中／失败／已保存有不同文案。未知或未提供状态不显示“已保存”。失败就近显示原因与重试；阻塞错误不能仅依赖短暂 Toast。内联保存失败：浅底 `#FEF2F2`、错误字 `#B91C1C`、墨色重试；与当前焦点和未写入草稿并存，重试不得清空编辑内容（转写对照板 29）。减少动态保留状态文字和进度，去除非必要位移、闪烁与脉冲。

### 复合状态

选中用底色，焦点用外环，错误用边线／图形与文字，待处理用标记与文案。支持选中+焦点、选中+错误、焦点+错误、选中+悬停；互不覆盖。禁用不显示可编辑光标，只读不等于禁用。

## 6. 键盘与焦点

输入控件先处理按键，再到浮层，最后才到工作区快捷操作；一次按键不能同时提交文本与播放音频。Tab／Shift+Tab 遵循可见顺序，不进入隐藏栏。Enter／Space 按当前控件语义操作；Cmd／Ctrl 随平台统一显示。高风险确认默认聚焦取消，所有浮层关闭均有明确返回目标。

焦点不能只靠文字变色。2px 外环 + 2px 间隔；命中覆盖图标及标签，不迫使用户点击细线。

## 7. 领域 UI 模式

### 时间轴

播放头是 2px 墨色实线（暗色用纸色）；循环／时间选区为浅灰 tint；键盘焦点是墨色外环。三者形状不同，不共用同一底色。红色在时间轴上只表示保存失败。手柄可视 2px、命中至少 8px；拖动显示虚影与新起止，吸附显示引导与提示，操作拒绝说明原因。

说话人轨和层联动线不用彩色，靠墨色深浅（`--series-ink-0..3`）、线型（实线、虚线、点线）和字母标记区分。暗色第四档是 `#8A847A`，不跟 `--gray-7`。只有颜色不同的两个系列不算可区分。暗色成功色点和警告色点跟各自的文字色（`#4ADE80` / `#FBBF24`），不沿用亮色色点。机器转写置信度：中＝墨色虚下划线，低＝琥珀实下划线（待复核）。转写人自标的确定度 ✓ ≈ ? 全用墨色，靠字形区分。

说话人／层分轨，合法跨轨重叠可辨认。极窄片段保留边界与提示入口，隐藏放不下的长文字。时间码 LTR；本模式不决定切分或磁吸算法。

### 播放与时间轴编辑

播放按钮是播放条上唯一的墨色实心按钮；循环、吸附等切换按钮用 `aria-pressed`，开着是选中底。速度只给离散档 0.5–2×。时间码输入等宽，回车跳转、Esc 还原，格式错保留输入。全稿概览框出当前视窗，拖框平移。拖边界：原位置留虚线虚影，实时读新起止，吸附时出现墨色虚线引导线并写明吸附到什么；到极限时手柄停住并就近说明，不弹窗。多选时焦点只在最后操作的一段，右键菜单切成批量项。点层用菱形，选中实心。跨轨重叠在两轨上叠斜线纹。语谱图默认墨色单色阶；设置里可切换为 viridis，不提供彩虹色阶。

### 嵌入媒体与文档视图

视频面板与 PDF 查看器直接贴合所属分栏边界，用 1px 分隔线相接，不另套卡片外框、圆角或投影；视频面板紧贴波形并与波形共用播放头。第三方地图默认使用灰阶底图与墨色标点（不用彩色图钉）；卫星影像与彩色地形底图只在用户主动切换图层时显示（[ADR-0109](../../docs/adr/0109-design-system-no-info-blue-noto-ipa-and-menu-target.md)）。

### 转写主工作区（应用主稿）

转写壳主稿在 Open Design 里按本规范重画（[ADR-0101](../../docs/adr/0101-desktop-visual-direction-reexplore-superdesign.md)、[ADR-0102](../../docs/adr/0102-desktop-design-drafts-move-to-open-design.md)），定稿前以下布局与状态清单就是要求。Penpot 板 51–61 只作历史参考。切片 1 差额见 [jieyu-4ws-slice1-transcription-gap-2026-11-01.md](../../docs/execution/plans/jieyu-4ws-slice1-transcription-gap-2026-11-01.md)。

布局：52px 左轨 + 上下文（稿件／层／片段列表）+ 主区（播放／波形／多轨时间轴）。**无右栏检查器、无底部「当前片段」页**。正文在时间轴选中块内就地编辑；拆分／合并／删除／备注／进标注等对象操作进右键菜单（按选中对象与数量启用），不把每个动作做成常驻工具栏按钮。常驻仅保留播放／视图／缩放／撤销与保存状态。

同壳状态只改差异层：

- 保存中、结果未知、保存失败与未生效草稿 → 反馈规则见 §5
- 离开守卫（失败留稿／在途核实）
- 1280 与窄窗：先收上下文为重开条，保留轨、主时间轴与焦点 → §1
- 暗色同布局 → 选中 `#282825`、焦点 `#F4F2EC`，见 §2
- 空媒体 → 单一主要下一步「导入录音」

主稿须一眼可分：中性选中底、墨色焦点环、墨色播放头、重叠话轮分轨。内联保存失败用浅底 `#FEF2F2` + 错误字 `#B91C1C` + 墨色重试，与焦点和未保存草稿并存，不得清稿。结果未知时不提供重试或放弃。

### AI 侧栏

对话用左右气泡：用户发言墨色气泡靠右（字用 `text-on-action`），AI 回复浅灰气泡靠左。气泡圆角 8px，最大宽度约为侧栏的 85%。工具调用和审批是细边卡片，不放进气泡；批准是墨色主按钮，拒绝是次按钮。输入框贴底，发送为墨色图标按钮。

建议审核队列每条写位置、前后对照和来源；批量采纳只要有一条冲突就整批不写入并指出哪条；建议关闭后仍保留。数据发往云端或外部工具（MCP）前，确认框写清发什么、不发什么、发给谁，默认焦点「不发送」。

### IGT

词列与语素列依据对应关系排列，列宽由同组最长内容决定；不按字符数插空格。缺 gloss 保留位置，多语素分列；长词不截断。需要滚动时横向移动整组，不允许原文、语素与 gloss 各自错位。UI 标签与研究内容字族分离。

语法 gloss 用小型大写，词汇 gloss 不用。单元状态：缺 gloss 虚线占位，自动 gloss 未确认点线，不认识的缩写红色波浪线，待复核琥珀底线；错误同时进校验面板并可定位。候选分析写来源和出现次数，AI 候选标「未确认」。

### 专业查询

条件构建器与文本语法是同一查询的两种视图，切换不丢条件；条件组用缩进加左侧灰条。语法错误用波浪线加行列号和修正建议。执行中锁住会改数据的操作并可取消，取消后保留已扫描结果并写明不完整。结果头写条数、截断与是否过期，结果项点击定位到片段。

## 8. 主题、对比与检查边界

亮暗保持相同角色，主要操作反相、导航文字常亮。选中+焦点+错误在两种模式里含义相同。字号放大不裁内容；减少动态不消失状态说明。

按 sRGB 相对亮度公式计算的基线（`npm run build:od-tokens` 生成值）：亮色正文／panel 18.88、次级／panel 11.37、弱文字／panel 6.69、正文／选中 15.98、CTA 18.88、焦点／panel 18.88、控件边界 `--border-control`／panel 3.03；暗色对应 16.19、10.41、5.27、13.21、17.50、16.19、3.21。正文目标 ≥4.5，焦点及控件边界目标 ≥3（已达标，并由 `check:docs-governance` 自动拦截退化，[ADR-0108](../../docs/adr/0108-control-border-contrast-3-to-1.md)）。分隔线 `--border-strong`／`--border-soft` 不承担控件识别，不受 3:1 约束。

这些只是明确颜色对的计算结果，不表示所有透明叠层、动画、屏幕阅读器或运行中的 Tab／Esc 已通过验证。UI 规范本轮不以后台功能、数据库或发布验收作为完成条件。

## 9. 设计包与稿件位置

设计系统包在 `design/jieyu-paper/`（[ADR-0106](../../docs/adr/0106-design-system-package-lives-in-repo.md)）：本文件是规则正文，`preview/` 是组件预览页，`tokens.css` 由代码 token 生成。页面精稿在 Open Design 里画，只用这里的组件与 token；导出 HTML 只作参考，不进代码。Penpot「解语 · UI 规范」00–17 与板 27–61 已停止维护，只作历史出处。

现有组件映射和后台工程规格后续单独制定。代码实现仍须遵守仓库既有约束；本文件不修改产品数据语义、冻结格式或发布范围。用户可见文案接入产品时统一经过字典。
