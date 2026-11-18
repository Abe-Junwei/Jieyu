---
name: 解语 Jieyu Studio
description: 濒危语言田野工作台 — 纸本田野笔记，白纸墨色，克制三档靛青主题色
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
  focus-accent: "#5C5C5C"
  focus-accent-dark: "#9E998F"
  brand-solid: "#4338CA"
  brand-solid-dark: "#5B5BD6"
  brand-on: "#FFFFFF"
  brand-tint: "#EEEDFB"
  brand-tint-dark: "#222038"
  mark-secondary: "#3B359E"
  mark-secondary-dark: "#B6B2F2"
  chrome-rail-bg: "#FFFFFF"
  chrome-rail-active: "#F5F5F5"
  chrome-rail-bg-dark: "#0C0C09"
  chrome-context-bg: "#F5F5F5"
  chrome-context-bg-dark: "#121210"
  toast-bg: "#111111"
  toast-bg-dark: "#2C2B28"
  toast-fg: "#FFFFFF"
  toast-fg-dark: "#F4F2EC"
  toast-border-dark: "#3A3832"
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
  chrome-context:
    backgroundColor: "{colors.chrome-context-bg}"
    textColor: "{colors.text-on-chrome}"
  toast:
    backgroundColor: "{colors.toast-bg}"
    textColor: "{colors.toast-fg}"
    rounded: "{rounded.menu}"
    padding: "8px 8px 8px 12px"
---

# 解语 UI 规范

本文件只规定视觉、组件、交互表达与桌面适配。产品流程样例可作参考；查询语言、存储、并发、文件事务、发布范围等工程规格以后另定，不作为本轮 UI 规范完成门槛。

> 2026-11-16 起，默认外观是 Open Design 里定下的「纸本田野笔记」（[ADR-0103](../../docs/adr/0103-paper-field-notes-is-the-only-appearance.md)）。旧的多套配色不再可用。与风格无关的工程规则（ADR-0101 第 4 条）保留。

设计系统只有一套，在 `design/jieyu-paper/`：本文件是正文（根目录 `DESIGN.md` 是指向它的软链接），`tokens.css` 由 `npm run build:od-tokens` 从 `src/styles/tokens.css` 生成、不手改。页面精稿在 Pixso（[ADR-0118](../../docs/adr/0118-pixso-is-the-design-draft-workspace.md)）。

颜色与尺寸以 `src/styles/tokens.css` 为准。UI 规范描述目标表达，不声明现有组件或运行行为已全部实现。

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
- 时间轴片段分两档（[ADR-0115](../../docs/adr/0115-timeline-waveform-and-segment-highlights.md)）：当前激活／编辑语段用 `--brand-tint` 浅底，外框与输入焦点相同（4px 圆角、1px `--fg-2`、`--focus-ring` 3px 淡墨晕，[ADR-0117](../../docs/adr/0117-active-segment-uses-input-focus-chrome.md)）；跨层同时间伴随对齐段保留中性 `--selection`（墨色 8% 混入纸面，亮 `#ECECEC`、暗 `#282825`），悬停仍用 tint。
- 焦点分两类，都不再用纯黑粗外框（[ADR-0110](../../docs/adr/0110-focus-graphite-ring-and-soft-ink-halo.md)）：按钮、复选框、单选框、标签页、图标按钮，以及时间轴上未激活的片段，用 1.5px 铅笔石墨细环 `--focus-color`（亮 `#5C5C5C`、暗 `#9E998F`，外扩 2px，贴边溢出容器内缩 1.5px）；输入框、文本域、下拉框、行内编辑格和当前激活语段不加第二道外框，只将自身 1px 边加深到次墨 `--fg-2` 并配 3px 淡墨晕 `--focus-ring`（错误态聚焦保留红边并配淡红晕 `--focus-ring-danger`）。激活语段的底色仍是 `--brand-tint`。不用于主按钮填充，也不用靛青。
- 克制主题色（[ADR-0114](../../docs/adr/0114-restrained-theme-accent-three-tier-scale.md)）：按 Radix 三档拆成实心填充 `--brand`（亮 `#4338CA`、暗 `#5B5BD6`，前景固定 `--brand-on: #FFFFFF`）、浅底承托 `--brand-tint`（亮 `#EEEDFB`、暗 `#222038`）、可读文字与图标 `--secondary` / `mark-secondary`（亮 `#3B359E`、暗 `#B6B2F2`）。正文内链接常驻 1px 下划线（偏置 3px），不单靠颜色与正文区分；悬停转正文墨色，焦点走 1.5px `--focus-color` 细外环。
- 文字选区 `::selection`：使用 `--text-selection`（亮 `#E2E2E2`、暗 `#3A3832`）配正文墨色，禁止落回浏览器默认亮蓝底。
- 工作面 / 面板：亮 `#FAFAFA` / `#FFFFFF`，暗 `#0C0C09` / `#161614`。
- 正文 / 次级 / 辅助：亮 `#111111` / `#3A3A3A` / `#5C5C5C`，暗 `#F4F2EC` / `#C8C4BA` / `#8E8A82`。
- 分隔线用 border-subtle / soft；控件可操作边界（输入类控件、复选框、单选框、带边按钮）用 border-control（亮 `#949494`，暗 `#6A675F`；悬停加深到次级文字色，禁用退回 border-soft；转写工具栏与对话框关闭按钮保持无边框，[ADR-0108](../../docs/adr/0108-control-border-contrast-3-to-1.md)）。不拿浅分隔线充当控件边界。
- 导航轨底色使用 chrome-rail-*，与纸面同色。当前工作区是 44×44、圆角 `--radius-md` 的 `--brand` 实心块，图标 20px、`--brand-on`，项间距 8px（精稿帧 `19:6187`，[ADR-0124](../../docs/adr/0124-left-rail-current-item-matches-pixso-shell.md)）。其余项仍是正文墨色。复选框、单选、开关开态，连续滑块（音量／缩放）填充轨，以及导入、导出、加载进度条统一用 `--brand` 实心（配 `--brand-on` 白字）；工具栏切换按钮 `aria-pressed="true"` 与筛选标签 `aria-checked="true"` 用 `--brand-tint` 底 + `--secondary` 前景，与时间轴／列表对象的中性选中底严格区分。标签页当前项用 2px `--brand` 下划线（文字仍是加粗墨色），路径的可点上级项用 `--secondary` 文字（[ADR-0119](../../docs/adr/0119-theme-accent-for-steps-tabs-paths-and-quiet-indicators.md)）。
- 上下文栏使用 `--context`（`--chrome-context-bg`）。亮色 `#F5F5F5`，暗色 `#121210`，只比纸面深一档。和主工作区的分界用 `--border`，不靠把整栏涂深。栏内选中行用 `--selection` 并保留左侧墨条，输入框保持纸色。
- 语义 solid / text 分开：成功 solid `#16A34A`、文字亮色 `#166534`、暗色 `#4ADE80`；警告 solid `#D97706`、文字亮色 `#92400E`、暗色 `#FBBF24`；错误 solid 亮色 `#DC2626`、暗色 `#F07171`。正文不直接使用未达对比度的 solid 色。没有第四种语义蓝色；一般信息提示用中性浅灰底或墨色壳加墨点（[ADR-0109](../../docs/adr/0109-design-system-no-info-blue-noto-ipa-and-menu-target.md)）。

语义状态同时给图形／色点与文字。Toast 使用墨色壳 + 色点（暗色是 `--toast-bg` 暖黑 `#2C2B28` 加 `--toast-border` 发丝边，不反转成米白），Chip 使用中性壳 + 色点；内联反馈可以使用浅语义底。只有这一套外观，设置里只切换亮色、暗色或跟随系统。

## 3. 字体与排版

- UI：Noto Sans / Noto Sans SC；主标题 20/28、分组标题 16/24、正文 14/22、工具与说明 13/20。需要衬线时用 Noto Serif / Noto Serif SC。
- IPA / IGT / 例句：统一使用 Noto Sans（`--font-ipa: 'Noto Sans', sans-serif`，不用 Charis SIL）；默认 16/24，内容展示可在 14–18px 范围调整并保持足够行高。不得用于按钮、菜单、导航和 UI 标题。界面、衬线、等宽与 IPA 所用的 Noto 字体全部随应用打包，不从网络加载（[ADR-0109](../../docs/adr/0109-design-system-no-info-blue-noto-ipa-and-menu-target.md)）。
- 时间码与参数：Noto Sans Mono / ui-monospace；12/18，固定 LTR。Pixso 云端没有 Noto Sans Mono 和 Noto Serif SC，稿里用替身：正文 Noto Sans SC，衬线 Source Han Serif CN，等宽 JetBrains Mono，音标 Noto Sans SemiCondensed。产品仍打包 Noto，不从网络加载。
- 只有这 6 档（20、16、14、13、12，加 IPA 16），全部随设置里的字号缩放。最小 12px；面板里旧的 9–11、15、18、22px 已并入相邻档（[ADR-0104](../../docs/adr/0104-type-space-shadow-and-ink-only-series.md)）。
- 附标、声调、送气和长音符号不得截顶压底。字族回退仍需保证可读，不用额外空格弥补字体或对齐问题。字号缩放到 140% 时允许标签与说明换行、行容器增高，不裁切主动作；RTL 语料与注释行内嵌时间码、ID、键位、代码片段一律固定 `direction: ltr`。
- 文案语气：平实陈述事实，禁止感叹号与营销修辞；操作按钮一律用动词（「保存」「导出为 EAF」，不用「好」「确定」）；报错与阻断必须写清「什么没成、已有数据是否安全、下一步能做什么」。
- 长名称单行省略时须有完整内容查看方式；不省略错误原因、状态和关键动作。正文优先换行，不能用省略号隐藏必须阅读的信息。

## 4. 间距与形状

4px 步进，优先 8px 节奏。组件内部只用 4 / 8 / 12 / 16 / 24 / 32px；40 / 48 / 64px 只给页面级留白。不用 20、10、6px 这类非步进值，行内边距取 8 或 12。正文和控件间距 12–16px，独立分组间距 24px。

- 工作面圆角 0；菜单、提示和对话框 8px；控件 4px。不设 2px 档，`--radius-xs` 与 `--radius-sm` 同 `--radius-md`。
- 按钮默认 32px、紧凑 28px；单行输入默认 32px、紧凑不低于 28px。领域编辑单元可随字号与内容增高。
- 图标统一使用 Lucide（`lucide-react`）轮廓风格，经由 `JieyuIcon` 入口；只有两档：20px 给左轨、空状态和拖放区，16px 给按钮、伴随文字和控件内记号。线宽 1.75，颜色跟随文字，不单独上语义色。图标与文字间距 8px，不混用彩色 emoji。命中优先 28×28，最低 24×24；时间轴细手柄例外见领域模式。
- 图标只给没有文字也能认出的通用操作：工具栏常驻动作、下拉／树展开／关闭／清除／移除／更多／拖动把手、左轨导航、列表末尾的「添加」和空状态主图形。不用图标：状态（用色点＋文字）、IGT／IPA／说话人字母（语料字形）、带动词的文字按钮、菜单项、标签页和列表行；也不拿 Unicode 箭头和三角（▾ ▸ ⋯ × ＋）充当控件。Pixso「组件」页的「图标 / 名称」与产品 `JieyuIcon` 同名，一个意思只对应一个图标（[ADR-0111](../../docs/adr/0111-icon-usage-and-tag-family.md)）。

| 名称 | 用途 |
| --- | --- |
| library | 工程夹 |
| audio-lines | 转写 |
| pencil | 标注 |
| book-open | 词典 |
| notebook-pen | 语料库 |
| brain | 分析复核 |
| languages | 语言资产 |
| settings | 设置 |
| panel-left-open | 重开上下文栏 |
| panel-left-close | 收起上下文栏 |
| play | 播放 |
| pause | 暂停 |
| skip-back | 后退 |
| skip-forward | 前进 |
| repeat | 循环选区 |
| volume-2 | 音量 |
| zoom-in | 放大 |
| zoom-out | 缩小 |
| expand | 适应全部 |
| focus | 适应选区 |
| magnet | 吸附到边界 |
| undo-2 | 撤销 |
| redo-2 | 重做 |
| upload | 导入、拖放区 |
| file-exclamation-point | 文件损坏或版本拒绝打开 |
| copy | 复制代码块或诊断摘要 |
| search | 查找框前缀 |
| arrow-up | 发送、上移、升序 |
| arrow-down | 下移、降序 |
| list-indent-decrease | 升一级 |
| list-indent-increase | 降一级 |
| chevron-down | 下拉、展开的树节点 |
| chevron-right | 收起的树节点 |
| chevron-up | 数字加 |
| ellipsis | 行内「更多」 |
| x | 关闭、清除、移除标签 |
| plus | 列表末尾「添加」、分组新建 |
| check | 筛选标签已选 |
| grip-vertical | 拖动把手 |

- 列表／表格默认行高 36–44px，密度一致；不要单凭缩小字形制造紧凑感。
- 工作平面、面板和卡片不加投影。浮层用发丝边加三档阴影之一：`--shadow-popover`（菜单、Tooltip）、`--shadow-float`（层操作、备注等浮动面板）、`--shadow-modal`（模态）。按钮等独立控件焦点用 1.5px `--focus-color` 外环，输入类焦点用 `--focus-ring` 3px 淡墨晕，不手写粗黑双环。最多两层可见容器边框，内层用间距和底色分组。
- 层级顺序（7 档语义 `z-index`）：内容 `--z-base`（1）< 粘顶表头与标尺 `--z-sticky`（20）< 导航轨与分栏壳 `--z-shell`（40）< 贴边非模态抽屉 `--z-drawer`（80）< 菜单、下拉与浮动面板 `--z-popover`（160）< 提示条与 Tooltip `--z-toast`（240）< 模态与阻断层 `--z-modal`（320）。不手写随意整数。
- 滚动条与粘顶（sticky）：统一 6px 药丸拇指（`--border-strong`，悬停 `--border-control`）、透明无底轨道；粘顶表头、时间刻度与工具栏只用 `1px` 底边分隔，禁止加投影。
- 动效与退化：只有两档——悬停、色变、小控件 `--motion-fast`（160ms），浮层与抽屉进出 `--motion-base`（200ms），缓动 `ease-out`。开启「减少动态」或 `prefers-reduced-motion: reduce` 时去掉位移、脉冲与旋转闪烁，保留透明度切换、色点与文字状态。
- 光标与拖放四态：水平调宽／句段边界用 `ew-resize`，轨高调节用 `ns-resize`，可拖排序把手悬停 `grab`、按住拖动中 `grabbing`，不可放置目标用 `not-allowed` 并就近给出原因文字。

## 5. 组件与通用状态

### 按钮

实样覆盖默认、悬停、按下、键盘焦点、禁用、处理中。主要、次要、危险为三种语义层级；同一操作组至多一个主要操作。危险按钮用危险文字与上下文，不把整组动作涂红。

按钮用动词；处理中保留宽度并说明动作，不因文字变化挤动相邻项。禁用时仍能找到原因。文字按钮与图标按钮也必须有悬停、焦点和可理解名称。

### 输入与表单

永久标签、输入区、帮助／错误区分开；占位符不代替标签。默认、悬停、焦点、错误、只读、禁用与 IME 输入中分别呈现。

错误保留原内容，给具体原因与修正方式，不能只变红。只读允许选择复制，禁用表示当前不可操作。帮助和错误占布局空间，不覆盖下一字段。IME 组合期间 Enter 不穿透为提交、播放或切换。

### 选择控件

复选用于多选，单选用于互斥，开关用于即时启停；开关旁功能名稳定，不随开关变成两个不同动作。复选混合态使用短横，不伪作全选。选择控件的悬停、焦点、禁用表达沿用通用规则；错误在组标题／说明处给出，不只给某个选项涂红。筛选标签属于选择控件，规则见下节。

### 标签与徽标

一个家族、五种用途，全部 pill 圆角、12px 字，不给分类配色（[ADR-0111](../../docs/adr/0111-icon-usage-and-tag-family.md)）：

- 计数徽标：20px 高，只放数字；默认浅灰底，错误浅红底，需要处理的新项墨底。超过 99 写「99+」，读屏读完整数字；为 0 时不显示。
- 状态片：24px 高，浅灰底＋色点＋次墨文字；颜色只在色点上。
- 确定度徽标：16px 圆形，只放字形，11px 粗体居中；确定＝`--success-bg` 底＋`--success-text` ✓，不确定＝`--warn-bg` 底＋`--warn-text` ≈，没听懂＝`--danger-bg` 底＋`--danger-text` ?。挂 `aria-label` 并悬停显示同一文字；图例写成「徽标＋文字」（[ADR-0120](../../docs/adr/0120-transcriber-certainty-as-status-badge.md)）。
- 备注徽标：句段有备注时显示 16px 文档形（Lucide `file-text` 轮廓），`--brand-tint` 纸面＋`--secondary` 描边——备注是次要标记，不是状态，不用状态色也不用信息蓝。与确定度徽标在语段右侧竖排（确定度在上、备注在下）；可点击打开备注浮动面板，`aria-label` 带条数。
- 只读标签：词性、语义域、层类型、讲述人；浅灰底，无边框、无悬停。一行最多 3 个，其余收成「+N」；最长 200px，超出省略并可悬停看全名。
- 筛选标签：白底＋控件边（`--border-control`）；选中为 `--brand-tint` 底＋`--brand` 边＋`--secondary` 字与勾，悬停、焦点、禁用齐全；空格切换。
- 输入标签：标签输入框里的值，浅灰底＋末尾移除按钮；移除图标 16px，命中向外扩到 24×24，不与标签本体点击混用。第一次退格选中最后一个，第二次删除。

在标签家族里，靛青只给次要标记（未确认的 AI 候选、引用来源；`--brand-tint` 底加 `--secondary` 字），不表示状态，也不当分类色。讲述人等系列区分用字母和墨色深浅，不用彩色标签。

### 导航、标签页、折叠头与列表

位置与操作分开。当前项用中性背景和位置标识；悬停不能替换当前项，焦点离开不移除选择。排序表头给方向，行内菜单独立命中。导航缩写／图标可查看完整名称。折叠头（Disclosure）高 36px，前放 16px 箭头（收起 `chevron-right`、展开 `chevron-down`），不用正负号，展开内容靠左缩进与间距分组、不再套第三层容器边框；Enter／Space 切换 `aria-expanded`。

### 浮层与贴边抽屉

菜单、Tooltip、模态、悬浮面板与贴边非模态抽屉分别使用：贴合窗口或分栏边缘滑出的非模态抽屉（`--z-drawer`）用 1px 分隔线、圆角 0、**不加阴影**；脱离边缘悬在画布上的非模态面板才用 8px 圆角加 `--shadow-float`；模态统一带 `1px solid var(--border)` 发丝边加 `--shadow-modal`。模态遮罩用 `--scrim`（`color-mix(--shadow-color 44%)`，亮暗同值）；非模态不铺全页遮罩。Tooltip 外壳复用 `--toast-bg` / `--toast-fg` / `--toast-border`（暗色保持暖黑壳，不反转成米白），不承载必须点击的操作；模态锁定焦点，非模态不锁整个工作面。Esc 只处理最上层可关闭层，关闭后返回原触发控件。存在未处理输入时不得通过遮罩点击静默丢弃。

### 数据表格与字段组

词典列表、查询结果、导入预览共用一种表格：表头 36px、行 40px；数字右对齐等宽；研究内容用 IPA 字族。单元格焦点是墨色内框，双击或 Enter 就地编辑、Esc 还原。列宽可拖，分隔线命中 9px。截断、过期、失败写在表格上方或下方，不只靠颜色。

可重复字段组（义项、例证、反查）：子级缩进 28px，用浅底不用边框。拖动把手或上移／下移按钮排序，升降级用按钮，到头时禁用；拖动时画墨色插入线。引用用次要标记色下划线；失效引用删除线加原因，可迁移或解除。前后对照：删去用灰色删除线，新增用浅灰底加墨色下划线，不用红绿。

### 树、路径与分隔线

树每级缩进 16px，→ 展开或进子级，← 收起或回父级，行内「⋯」悬停或焦点时出现、内容与右键菜单一致。路径只用在跨层级跳转（引用、查询结果、词条出处），可点的上级项用 `--secondary`、悬停加下划线，末项是当前位置、加粗墨色、不可点，分隔符「/」用淡墨，过长从中间折叠。面板分隔线可视 1px、命中 9px，拖动时墨色 2px；上下文栏收起后留 32px 重开条，写当前位置。

### 向导与长任务

向导步骤：已完成 `--brand` 实心圈配白勾，当前 2px `--brand` 边配 `--secondary` 序号，未到灰边；有阻断项时当前步骤用错误边加「!」和数量。可回到已完成步骤，不能跳过未完成步骤。导出先列会丢失的内容和数量，再列完整保留的。长任务给计数和取消；失败写清项目有没有被改动；写入结果不能确认时说明正在核实，不显示完成。回收站写剩余天数和引用影响，永久删除另行确认。

### 桌面外壳

窗口标题栏和菜单栏用系统原生。完整应用菜单（文件、编辑、播放、片段、视图、窗口、帮助）是桌面版目标规格：工具栏上的每个动作在菜单栏里都能找到，快捷键两处一致，以 `KeybindingService` 默认值为准；⌘M 是「与后一句合并」，窗口菜单的「最小化」不带快捷键；不可用项置灰不隐藏（当前 Electron 骨架期仅先按 [ADR-0107](../../docs/adr/0107-motion-compact-height-selection-and-shortcuts.md) 让出 ⌘M，完整动作与置灰同步随各工作区切片落地，见 [ADR-0109](../../docs/adr/0109-design-system-no-info-blue-noto-ipa-and-menu-target.md)）。工具栏分前段（编辑历史）、中段（视图）、后段（保存状态与「更多」），变窄时从中段收起，保存状态最后收。设置左侧分类、右侧即时生效，没有「应用」按钮；影响数据的设置单独确认。首次打开只有一个主要操作；找不到的最近项目给重新定位，不删除。拖放永远有等价的「选择文件…」，不接受的类型在松开前说明。

### 反馈与阻断

空状态说明原因并给至多一个主要下一步，主图标用 `--secondary`；Skeleton 保留结构，加载文字说明当前状态；确定进度显示百分比，不确定进度不伪造数值。旋转加载环只允许 12px（按钮内）或 16px（行内伴随状态文字）单色细环（按钮内跟随按钮前景，行内用 `--secondary`），且耗时超过 300ms 才显现；禁止在画布中央单放无文字大转圈。

未保存／保存中／失败／已保存有不同文案。未知或未提供状态不显示“已保存”。失败就近显示原因与重试（句段标记 + 不自动关闭的失败提示条 + 底栏状态片）；阻塞错误不能仅依赖短暂 Toast。内联保存失败：浅底 `#FEF2F2`、错误字 `#B91C1C`、墨色重试；与当前焦点和未写入草稿并存，重试不得清空编辑内容（转写对照板 29）。桌面阻断态只设两类：① 项目文件损坏或数据库版本不兼容拒绝打开（写明未改动原文件并给快照恢复／返回列表）；② 局部面板异常边界（隔离故障区、保住其他分栏数据安全、给重新加载与不含语料的诊断摘要复制）。

### 提示条（Toast）

页面级通知只用提示条，不用页顶文案横幅（[ADR-0116](../../docs/adr/0116-page-notices-as-toasts-with-durable-carriers.md)）。提示条只负责告知，它带的动作在页面上必须有常驻入口：句段上的失败标记与重试、底栏保存状态片、编辑菜单与快捷键、菜单栏。关掉提示条不清除状态。

- 外壳：`--toast-bg` / `--toast-fg`，8px 圆角，`--shadow-popover`，宽 280–420px，最低 40px 高，内边距 8px 8px 8px 12px；前置色点或 12px 细环，正文 13/20 一句话，最多两行（次句 12/18、72% 前景）；最多一个动词动作（24px 高、40% 前景细边）；关闭钮 24×24 用 `x` 图标。
- 四类与时长：**结果**（4 秒，带撤销等动作 8 秒，悬停／焦点／窗口失焦时暂停）；**进行中**（超过 300ms 才出现，不自动关闭，完成后原位变成结果、失败或核实中）；**需要处理**（失败带重试、核实中不带任何动作，都不自动关闭）；**常驻情况**（恢复快照、只读窗口、离线：开始时出现一次，关掉后由底栏或工具栏状态承接，情况结束自动收起）。
- 位置与堆叠：当前工作区底部居中，底栏上方 32px（按工作区而不是整窗居中），不压导航轨与上下文栏；`--z-toast`。新的在下，间距 8px，最多 3 条，超出先收最早的「结果」，「需要处理」不被挤掉；同一件事原位更新，不叠新条。
- 可访问性：结果、进行中、核实中 `role="status"`，失败 `role="alert"`；不抢焦点；F8 跳到通知区，Esc 关掉当前条并回到原处。进入 200ms 淡入上移 8px，离开 160ms 淡出；减少动态时只留透明度，细环停转。
- 不做：页顶横幅、通知中心与历史、字段校验（就地显示）、两类桌面阻断（见上节）。

### 键帽与多行等宽块

正文说明与快捷键速查表用 `<kbd>` 键帽（20px 高、12px 等宽字、浅灰底 1px 细边，不画拟物厚底边；一个键一颗帽，字在帽里居中；macOS 用 `⌘⇧⌥⌃`，Windows／Linux 用 `Ctrl+Shift+Alt`）。菜单右列直接排符号、不加键帽框，顺序是 Control、Option、Shift、Command，再加主键；Home／End 用 ↖／↘。Pixso 云端字体里 Noto Sans SC、思源黑体和 JetBrains Mono 没有 U+232B，Fira Sans 的 ⌫ 是实心键形。快捷键符号用 Inter，⌫ 保持线框。多行查询语法、导出头预览、诊断摘要共用等宽块容器（12/18 等宽、固定 LTR、超宽横向滚动不软折行、右上角附复制按钮）。

### 复合状态

选中用底色，焦点用外环，错误用边线／图形与文字，待处理用标记与文案。支持选中+焦点、选中+错误、焦点+错误、选中+悬停；互不覆盖。禁用不显示可编辑光标，只读不等于禁用。

## 6. 键盘与焦点

输入控件先处理按键，再到浮层，最后才到工作区快捷操作；一次按键不能同时提交文本与播放音频。Tab／Shift+Tab 遵循可见顺序，不进入隐藏栏。Enter／Space 按当前控件语义操作；Cmd／Ctrl 随平台统一显示。高风险确认默认聚焦取消，所有浮层关闭均有明确返回目标。

焦点不能只靠文字变色。按钮与独立控件用 1.5px 石墨细外环（外扩 2px），输入类用次墨单边加 3px 淡墨晕（[ADR-0110](../../docs/adr/0110-focus-graphite-ring-and-soft-ink-halo.md)）；命中覆盖图标及标签，不迫使用户点击细线。

## 7. 领域 UI 模式

### 时间轴

播放头是 2px 墨色实线（暗色用纸色，且仅画在波形画布内）；波形选区用 `--brand-tint` 底加左右 1px `--secondary` 边界线，选区内的波峰用 `--secondary` 高亮，非选区波峰降为半透明次墨；当前激活语段用 `--brand-tint` 底加输入焦点那套圆角灰边，跨层伴随对齐段用中性 `--selection`；未激活片段的键盘焦点仍是石墨细外环（[ADR-0115](../../docs/adr/0115-timeline-waveform-and-segment-highlights.md)、[ADR-0117](../../docs/adr/0117-active-segment-uses-input-focus-chrome.md)）。红色在时间轴上只表示保存失败。手柄可视 2px、命中至少 8px；拖动显示虚影与新起止，吸附显示 `--secondary` 引导线与提示，操作拒绝说明原因。

说话人轨和层联动线不用彩色，靠墨色深浅（`--series-ink-0..3`）、线型（实线、虚线、点线）和字母标记区分。暗色第四档是 `#8A847A`，不跟 `--gray-7`。只有颜色不同的两个系列不算可区分。暗色成功色点和警告色点跟各自的文字色（`#4ADE80` / `#FBBF24`），不沿用亮色色点。机器转写置信度：中＝墨色虚下划线，低＝琥珀实下划线（待复核）。转写人自标的确定度用 16px 圆形徽标，见「标签与徽标」（[ADR-0120](../../docs/adr/0120-transcriber-certainty-as-status-badge.md)）。

说话人／层分轨，合法跨轨重叠可辨认。极窄片段保留边界与提示入口，隐藏放不下的长文字。时间码 LTR；本模式不决定切分或磁吸算法。

### 播放与时间轴编辑

播放按钮是播放条上唯一的墨色实心按钮；循环、吸附等切换按钮用 `aria-pressed`，开着是 `--brand-tint` 浅底配 `--secondary` 图标；连续滑块（音量、缩放）已填充轨用 `--brand`。速度只给离散档 0.5–2×。时间码输入等宽，回车跳转、Esc 还原，格式错保留输入。全稿概览框出当前视窗（`--secondary` 边框 + 淡主题底），拖框平移。拖边界：原位置留虚线虚影，实时读新起止，吸附时出现 `--secondary` 虚线引导线并写明吸附到什么；到极限时手柄停住并就近说明，不弹窗。多选时焦点只在最后操作的一段，右键菜单切成批量项。点层用菱形，选中为 `--brand` 实心。跨轨重叠在两轨上叠斜线纹。语谱图默认墨色单色阶；设置里可切换为 viridis，不提供彩虹色阶。

### 嵌入媒体与文档视图

视频面板与 PDF 查看器直接贴合所属分栏边界，用 1px 分隔线相接，不另套卡片外框、圆角或投影；视频面板紧贴波形并与波形共用播放头。第三方地图默认使用灰阶底图与墨色标点（不用彩色图钉）；卫星影像与彩色地形底图只在用户主动切换图层时显示（[ADR-0109](../../docs/adr/0109-design-system-no-info-blue-noto-ipa-and-menu-target.md)）。

### 转写主工作区（应用主稿）

转写壳主稿在 Pixso「精稿」页（[ADR-0118](../../docs/adr/0118-pixso-is-the-design-draft-workspace.md)）。定稿前以下布局与状态清单就是要求。切片 1 差额见 [jieyu-4ws-slice1-transcription-gap-2026-11-01.md](../../docs/execution/plans/jieyu-4ws-slice1-transcription-gap-2026-11-01.md)。

布局：52px 左轨 + 上下文（稿件／层／片段列表）+ 主区（播放／波形／多轨时间轴）。**无右栏检查器、无底部「当前片段」页**。正文在时间轴选中块内就地编辑；拆分／合并／删除／备注／进标注等对象操作进右键菜单（按选中对象与数量启用），不把每个动作做成常驻工具栏按钮。常驻仅保留播放／视图／缩放／撤销与保存状态。

同壳状态只改差异层：

- 保存中、结果未知、保存失败与未生效草稿 → 反馈规则见 §5
- 离开守卫（失败留稿／在途核实）
- 1280 与窄窗：先收上下文为重开条，保留轨、主时间轴与焦点 → §1
- 暗色同布局 → 选中 `#282825`、焦点环 `#9E998F`，见 §2
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

按 sRGB 相对亮度公式计算的基线（`npm run build:od-tokens` 生成值）：亮色正文／panel 18.88、次级／panel 11.37、弱文字／panel 6.69、正文／选中 15.98、CTA 18.88、焦点环 `--focus-color`／panel 6.69、控件边界 `--border-control`／panel 3.03；暗色对应 16.19、10.41、5.27、13.21、17.50、6.39、3.21。正文目标 ≥4.5，焦点及控件边界目标 ≥3（已达标，并由 `check:docs-governance` 自动拦截退化，[ADR-0108](../../docs/adr/0108-control-border-contrast-3-to-1.md)、[ADR-0110](../../docs/adr/0110-focus-graphite-ring-and-soft-ink-halo.md)）。分隔线 `--border-strong`／`--border-soft` 不承担控件识别，不受 3:1 约束。

这些只是明确颜色对的计算结果，不表示所有透明叠层、动画、屏幕阅读器或运行中的 Tab／Esc 已通过验证。UI 规范本轮不以后台功能、数据库或发布验收作为完成条件。

## 9. 关键边界对照与明确不做

### Do / Don't（最易破戒的三条）

| 场景 | Do（允许） | Don't（禁止） |
| --- | --- | --- |
| 容器嵌套层级 | 外壳 + 分栏最多两层带 `1px` 边框；第三层及以下靠 `var(--surface-warm)` 底色或 12–24px 间距分组 | 面板套卡片、卡片里再套带边子框或加投影 |
| 语义与差异表达 | 状态用「色点 + 文字」，前后对照用「灰删除线 vs 浅灰底 + 墨下划线」，系列用墨色深浅 + 线型 + 字母 | 只靠红绿底区分增删，或给词性／说话人／分类标签涂彩色 |
| 强调、选中与焦点 | 主操作用墨色实心，对象选中用浅灰底，按钮焦点用 1.5px 石墨细环，输入焦点用次墨边 + 淡墨晕；主题色拆成 `--brand` / `--brand-tint` / `--secondary` 三档给左轨当前项、开态控件、进度／滑块与链接 | 拿单文字色硬填实心控件、拿蓝色做信息提示底／主按钮／语段选中或焦点框；或给输入框叠双层纯黑套框 |

### 明确不做（Non-goals）

解语是本地优先的桌面语言学工作台，设计系统不收录、页面精稿也不得自行发明以下组件：用户头像与社交资料卡、营销落地页与大号英雄横幅、移动端断点与底部标签栏、通用彩色商业图表色板（声学波形与语谱图已按 §7 单独定规）、复杂日历日期选择器、页码式传统分页条（查询结果走流式列表 + 条数／截断头）、全局消息通知中心、浏览器时代的数据库迁移遮罩与离线断网横幅、多品牌外观切换器。

## 10. 设计包与稿件位置

设计系统包在 `design/jieyu-paper/`（[ADR-0106](../../docs/adr/0106-design-system-package-lives-in-repo.md)）：本文件是规则正文，`tokens.css` 由代码 token 生成。页面精稿在 Pixso 文件 `va44BZLBUSYRQ7KoiO3PJw`（[ADR-0118](../../docs/adr/0118-pixso-is-the-design-draft-workspace.md)）：组件在「组件」页，规范在「规范」页，转写精稿在「精稿」页。

现有组件映射和后台工程规格后续单独制定。代码实现仍须遵守仓库既有约束；本文件不修改产品数据语义、冻结格式或发布范围。用户可见文案接入产品时统一经过字典。
