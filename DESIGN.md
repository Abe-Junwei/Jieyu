---
name: 解语 Jieyu Studio
description: 濒危语言田野工作台 — 桌面壳、52px 左轨、墨色 CTA + 中性选中（无品牌主题色）的本地优先标注环境
colors:
  action-solid: "#0F0F10"
  action-hover: "#292524"
  action-active: "#000000"
  action-solid-dark: "#F6F7F9"
  text-on-action: "#FFFFFF"
  text-on-action-dark: "#0F0F10"
  theme-accent-solid: "#3A3F49"
  theme-accent-hover: "#2A2E35"
  theme-accent-active: "#20242C"
  theme-accent-tint: "#E8E7E4"
  theme-accent-text: "#20242C"
  theme-accent-solid-dark: "#B4BDCC"
  chrome-rail-bg: "#2A2E35"
  chrome-rail-active: "#3A3F49"
  chrome-rail-bg-dark: "#12141A"
  surface-canvas: "#F0EFED"
  surface-panel: "#FFFFFF"
  surface-header: "#F7F6F4"
  surface-elevated: "#FFFFFF"
  surface-canvas-dark: "#181B21"
  surface-panel-dark: "#20242C"
  surface-header-dark: "#262B35"
  text-primary: "#20242C"
  text-secondary: "#5B6577"
  text-tertiary: "#5F6B7C"
  text-on-accent: "#FFFFFF"
  text-on-chrome: "#FFFFFF"
  border-subtle: "#E7E5E4"
  border-soft: "#CBD2DC"
  border-strong: "#AEB7C4"
  border-control: "#7F8A9B"
  state-success-solid: "#10B981"
  state-success-text: "#047857"
  state-warning-solid: "#F59E0B"
  state-warning-text: "#92400E"
  state-danger-solid: "#E5484D"
  state-danger-text: "#B91C1C"
  state-info-solid: "#3B82F6"
  state-info-text: "#1D4ED8"
typography:
  main-h:
    fontFamily: "Inter, Noto Sans SC, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  sub-h:
    fontFamily: "Inter, Noto Sans SC, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  body-reg:
    fontFamily: "Inter, Noto Sans SC, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
  meta-tool:
    fontFamily: "Inter, JetBrains Mono, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  ipa-display:
    fontFamily: "Charis SIL, Noto Serif, Georgia, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  code-time:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
rounded:
  none: "0px"
  control: "10px"
  menu: "8px"
  dialog: "10px"
spacing:
  micro: "4px"
  tight: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
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
    height: "28px"
  chrome-rail:
    backgroundColor: "{colors.chrome-rail-bg}"
    textColor: "{colors.text-on-chrome}"
    width: "52px"
---

# Design System: 解语 Jieyu Studio

> Source: Stitch「文字精准校订版」HTML（Copy as code）+ Penpot「解语工程规范 · HTML结构重画」00–18  
> 工程实现：`src/styles/tokens.css` + `src/utils/theme.ts`（仅明暗 mode；无多外观 / 无品牌主题色）。  
> **主 CTA 为墨色**（`--action-*`）；**选中/焦点/媒体走中性 `--theme-accent-*`**（亮 `#3A3F49` / tint `#E8E7E4`），对齐 ElevenLabs 式无主题色壳。  
> **换选中阶**：只改 `src/styles/tokens.css` 的 `--theme-accent-*`（亮/暗）及 alias `--header-accent`；工程 `src/` 无散落 accent hex。Penpot `jieyu-stitch-light` 同步同名 token。勿再引入第二套主题枚举或彩色品牌 accent。  
> 元素样张以代码 props/CSS 为据；**按页精稿另轨**，本文件不替代四页工作区布局。

## Overview

**Creative North Star: "The Field Lab Console"**

解语是桌面优先的田野语言学工作台：冷静、密实、可长时间对波形与标注操作。视觉语言像实验室控制台——深石墨导航轨固定在左，工作面用微暖纸感灰/白分层，**墨色**作主操作，**中性选中**标焦点与媒体锚点；**不设品牌主题色**（彩色只留给 `--state-*`）。

密度偏 compact（控件 28–32px），面板与侧栏 **零缝隙咬合**，靠发丝线分组而不是嵌套卡片。亮/暗双模共用同一套语义 token 名。

**Key Characteristics:**
- 52px 固定左轨；禁止桌面全局顶通栏
- Ink CTA：`--action-*`；Selection One Voice：仅 `--theme-accent-*`（中性墨灰，非品牌色）
- 字族隔离：UI 无衬线 / IPA 衬线（Charis SIL）
- 4px 步进、偏 8pt 网格；面板圆角 0，控件 `--radius-control` 10px
- 主画布波形+IGT 仍演进冻结：规范约束壳与状态，不作像素验收
- 暗色已写入工程 token 且默认可开；**基线对实测已过 AA**（正文/主按钮/默认芯片，见下「对比度」）；高对比模式与复杂叠层仍可另测

## Colors

亮/暗双模语义 token。对比目标 WCAG AA（正文 ≥4.5:1，大字/图形 ≥3:1）。

### 对比度（2026-11-01 基线实测）
- 亮：primary/secondary/tertiary（`#5F6B7C`）在 panel / warm canvas 上 ≥4.5；action 墨色 / on-action ≥4.5
- 暗：primary/secondary/tertiary、action 反相、accent-text on tint、state text on panel ≥4.5；solid 图形 ≥3
- Toast / 语义 Chip：墨/中性壳 + 色点，正文对比走 `--text-on-action` / `--text-secondary`

### Action（主 CTA · 墨色）
- **Solid / Hover / Active** (`#0F0F10` / `#292524` / `#000000`): `--action-solid` / `--action-hover` / `--action-active`
- **On action** (`#FFFFFF`): `--text-on-action`
- 暗色反相：solid `#F6F7F9` · hover `#FFFFFF` · active `#E7E5E4` · on-action `#0F0F10`

### Selection accent（中性 · 非品牌色 · 非 CTA）
- **Solid** (`#3A3F49` / dark `#B4BDCC`): `--theme-accent-solid`（`--header-accent` 为其 alias）— 焦点环、选中描边、媒体点
- **Hover / Active** (`#2A2E35` / `#20242C`): `--theme-accent-hover` / `--theme-accent-active`
- **Selection tint** (`#E8E7E4` / `#2A2E35`): `--theme-accent-tint` — 选中行/段底，禁止当卡片底
- **Text on tint** (`#20242C` / `#F6F7F9`): `--theme-accent-text` — 选中底上的可读字色

### Neutral
- **Canvas** (`#F0EFED` / `#181B21`): `--surface-bg` / `--surface-canvas`
- **Panel** (`#FFFFFF` / `#20242C`): `--surface-panel`
- **Header strip** (`#F7F6F4` / `#262B35`): `--surface-header`
- **Elevated** (`#FFFFFF` / `#282D37`): `--surface-elevated` — 菜单/抽屉；配合微阴影
- **Chrome rail** (`#2A2E35` / `#12141A`): `--chrome-rail-bg`；active `#3A3F49` / `#1C2028`
- **Text**: primary `#20242C` · secondary `#5B6577` · tertiary `#5F6B7C`（暗态次级 `#B4BDCC`）
- **Borders**: subtle / soft / strong / control — `#E7E5E4` · `#CBD2DC` · `#AEB7C4` · `#7F8A9B`

### Semantic（手册 solid + 更深 text + 弱底）
| 角色 | solid | text（更深） | bg |
|------|-------|--------------|-----|
| Success | `#10B981` | `#047857` | `#F0FDF4` |
| Warning | `#F59E0B` | `#92400E` | `#FFFBEB` |
| Danger | `#E5484D` | `#B91C1C` | `#FEF2F2` |
| Info | `#3B82F6` | `#1D4ED8` | 由 solid 弱混 |

### Named Rules
**The Ink CTA Rule.** `PanelButton` primary 只走 `--action-*`；禁止用 `--theme-accent-*` 填主按钮。

**The One Voice Rule.** 选中/焦点/媒体只走 `--theme-accent-*`（中性墨灰）；禁止 `data-appearance` / `data-theme-accent` 多套并行，禁止另开品牌主题色。

**The No Brand Accent Rule.** 壳层不对齐消费级「一支品牌紫/蓝」；彩色仅 `--state-*` 与语义点。换选中阶只改 `--theme-accent-*`。

**The No Global Top Nav Rule.** 桌面端禁止全宽 Global Top Nav；导航只走 52px 左轨。

**The Hairline Not Nest Rule.** 侧栏与工作台内用 1px 发丝线分组，禁止侧栏嵌套卡片堆叠边框。

## Typography

**IPA:** Charis SIL — **仅** IPA / IGT / 例句  
**UI:** Inter + Noto Sans SC  
**Mono:** JetBrains Mono（时间码、token、参数）

### Hierarchy（手册 ch01 工程字阶）
- **main-h** 20 / 28 — 工作区主面板标题
- **sub-h** 16 / 24 — 轨道分栏 / 模态标题
- **body-reg** 14 / 22 — 正文、表单标签
- **meta-tool** 13 / 20 — 工具栏 / 检查器键值
- **ipa-display** 14–18（展示默认 16 / 24）— IPA
- **code-time** 12 / 18 — 时间码（强制 LTR）

Stitch「文字阶梯」屏的角色名（Section Heading / Caption / Label Caps 等）为补充映射；**工程尺寸以本表为准**。

### Named Rules
**The Type Isolation Rule.** Charis SIL 不得出现在按钮、导航、菜单或面板标题。

## Layout

- **Chrome:** 全高 52px 左轨 + 其余为工作面；无顶通栏。
- **Density:** Compact；主按钮 32px（compact 28px / hero 36px）；单行输入 min-height 28px；图标 28×28（触控 ≥24px）。
- **Rhythm:** Base unit 4px；优先 8px。步进 4 / 8 / 12 / 16 / 24。
- **Docking:** 主面板、侧栏 **0px** 对接。
- **Inspector / context:** 约 260–340px（手册常用 272 / 280–360）。
- **主画布:** 波形 + IGT 演进冻结；不以像素验收终版编辑器壳。

## Elevation & Depth

工作平面 **box-shadow: none**；浮层微阴影 `0 4px 12px rgba(32,36,44,≈0.08)` + 1px `#CBD2DC`。

## Shapes

- **Workbench panels:** 0px
- **Controls (button / input):** `--radius-control` 10px
- **Menus / dropdowns / tooltip:** 8px
- **Dialogs:** 10px
- Chip / tag 等仍可用 `--radius-sm`（6px）；勿把全局 `--radius-sm` 抬到 10

## Components

### Buttons
- **新 UI 只用** `PanelButton`：`variant` default | primary | ghost | danger | success；`size` default | sm | compact（见 Penpot 12）
- **primary** = 墨色 `--action-solid` / hover `--action-hover` / active `--action-active`；字色 `--text-on-action`；字重 500
- 同级禁双 Primary；选中/焦点环仍走 `--theme-accent-*`（非 CTA 填充）
- 遗留 `.btn` / `.btn-ghost`（`control-primitives.css`）勿再开第三套

### Inputs / Fields
- 高 28px min；圆角 `--radius-control`（10px）；边框 `--border-control`
- Focus：2px solid accent · offset 2px（非仅改边框色）
- 永久标签；禁仅用 placeholder；错误态保留草稿并可重试
- `FormField` props：label / htmlFor / hint / error / span（必填标记由调用方）

### Panel atoms（`src/components/ui` · Penpot 16）
| 组件 | 允许变体 | 用途 |
|------|----------|------|
| `PanelChip` | default / warning / danger / success | 徽标、计数；语义变体 = 中性壳 + 色点（非整颗彩底） |
| `PanelNote` | default / danger | 面板内说明 |
| `PanelFeedback` | error / warn / info | 校验/内联反馈 |
| `PanelSection` / `PanelSummary` / `ActionButtonGroup` | — | 结构与动作组 |
| `ModalPanel` | compact/wide 等以代码为准 | 模态；脏关闭由调用方 |

勿发明未在代码出现的 variant。

### Feedback · Toast（Penpot 16）
- `ToastVariant`：info | success | error | warning | recording | listening | routing | executing | ai-thinking
- 底中 pill；listening 可脉冲；可带 `actionLabel`
- 真源：`ToastContext.tsx` · `global-toast.css`

### Draft saveStatus（Penpot 16）
- `dirty` | `saving` | `error` | `undefined`
- **`undefined` ≠ 已保存**；error 须可重试入口
- 真源：`TimelineDraftEditorSurface.tsx`

### Recording · Waveform overlays（Penpot 16）
- 录音：idle / recording / has-audio / disabled（他段在录）/ error / permission
- 叠层：播放头 danger 实线 · 循环选区 accent tint · snap guide · 拖动 ghost；手柄 2px / 热区 ≥8px
- 真源：`timeline-translation-audio.css` · `waveform-display.css`

### Menu · Review · Gate · A11y（Penpot 17）
- Context menu：普通 / 选中 / 分隔 / 危险 / 禁用
- 待复核：计数徽标 + 上一条/下一条（非分析编辑器）
- `desktop-unavailable` · `FeatureAvailability` badge · `CatalogProjectGate`
- 开关：`jieyu-high-contrast` · `jieyu-reduced-motion` · icon-effect material|motion · `ui-font-scale`（明暗仍只走 `jieyu-theme`）

### Navigation
- 左轨 52px；活动底 `--chrome-rail-active`

### Timeline / IGT
- 状态与键盘可达性以手册 03–05 / Penpot 04–05 为准；04 为迷你样张，**不作主画布像素验收**。

### Empty / Skeleton / Spinner（Penpot 16）
- Empty：一句原因 + 至多一个主操作；首页/时间轴空态附加 `EmptyGhostRows`（装饰淡出行，`aria-hidden`）
- Skeleton / Spinner：加载与 `saving` 对齐，勿冒充成功态

### Toast（墨色 pill）
- 默认底为 `--action-solid` + `--text-on-action`；语义仅靠左侧色点（`::before`），勿整颗彩胶囊

## Element board index（Penpot「HTML结构重画」）

| 板 | 内容 |
|----|------|
| 00–03 | 壳 / token / 浮层 / 状态优先级 |
| 04–05 | 时间轴迷你态 · IGT/IME 生命周期 |
| 06–08 | 高危删除 · AI 审核 · 正字法桥 |
| 09–15 | a11y 断点 · 组件映射 · 间距 · Button 变体 · 字族 · 色板 · 快捷键 |
| **16** | Toast · Panel 原子 · saveStatus · 录音 · Empty/Skeleton · 波形叠层图例 |
| **17** | Context menu · 待复核 · 门闸/不可用 · a11y 开关 |

**可编辑约定（00–17 已结构改造）**：
- **SSoT 页**：Penpot「解语工程规范 · HTML结构重画」（封面 + 00–17，竖排 gap 80）。另一页「v2 归档」仅 Stitch 源图/旧原生板，**勿作规范源**。
- 各板根与分区为 **Flex Board**（语义命名卡片/行）
- 填充色优先绑 `jieyu-stitch-light` tokens（`action-*` 主 CTA / `theme-accent-*` 选中焦点 / `state-*` / `surface-*` / `border-*` / `chrome-rail-*`）；遗留 `canvas`/`panel`/`accent*` 已与 surface / theme-accent 对齐，新稿勿再写遗留名
- 板 **00** 左轨绑 `chrome-rail-bg`；板 **12** primary 绑 `action-solid`（不是 accent）
- 板 **16** 另含 Component Variant：`Toast / Pill`、`PanelChip`（属性 `Variant`），停在板 16 右侧
- 换选中阶改 `--theme-accent-*` token（保持中性）；改一态优先改 Variant / 分区内容；勿在实例上散落硬编码
- 内容为规范样张密度，**不是**四页工作区精稿

后续设计只复用上表元素；缺项先补板与代码锚点，再画页面。

## Do's and Don'ts

### Do:
- **Do** 用语义 CSS 变量，不在业务组件散落裸 hex 强调色。
- **Do** 主按钮用 `--action-*`；选中/焦点/媒体用中性 `--theme-accent-*`。
- **Do** 新 UI 用 `PanelButton`；遗留 `.btn` 仅作视觉别名，勿新开第三套。
- **Do** 保持 52px 左轨 + 零顶通栏。
- **Do** IPA 用 Charis SIL，UI 用 Inter / Noto Sans SC。
- **Do** 调整选中阶时只改 `--theme-accent-*` 一支（不动 action；保持中性）。
- **Do** 用户可见文案走 i18n。

### Don't:
- **Don't** 用 accent 填 Primary CTA。
- **Don't** 给 Toast / 语义 Chip 整颗彩胶囊底（色点即可）。
- **Don't** 恢复多外观 / 多强调色选择器，或再引入彩色品牌 accent。
- **Don't** 把选中/焦点做成消费级品牌紫/蓝。
- **Don't** 侧栏嵌套第三层边框卡片。
- **Don't** 把 Charis SIL 用在 chrome UI。
