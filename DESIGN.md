---
name: 解语 Jieyu Studio
description: 濒危语言田野工作台 — 桌面壳、52px 左轨、墨色 CTA + 中性选中 + 克制焦点青的本地优先标注环境
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
  theme-accent-tint: "#E0E0E0"
  theme-accent-text: "#20242C"
  theme-accent-solid-dark: "#B4BDCC"
  focus-accent: "#026370"
  focus-accent-dark: "#74A9B0"
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
    height: "32px"
  chrome-rail:
    backgroundColor: "{colors.chrome-rail-bg}"
    textColor: "{colors.text-on-chrome}"
    width: "52px"
---

# 解语 UI 规范

本文件只规定视觉、组件、交互表达与桌面适配。产品流程样例可作参考；查询语言、存储、并发、文件事务、发布范围等工程规格以后另定，不作为本轮 UI 规范完成门槛。

当前设计源为 Penpot「解语 · UI 规范」00–17；代码颜色参考 `src/styles/tokens.css`，主题参考 `src/utils/theme.ts`。UI 规范描述目标表达，不声明现有组件或运行行为已全部实现。

## 1. 视觉语言与布局

冷静、紧凑、适合长时间对照波形与标注。52px 深石墨导航轨、微暖工作面、白色面板。工作区平铺，面板相接无缝隙；禁止全宽顶部导航与层层卡片堆叠。

- 页面头部只服务所属工作区，不横跨导航轨。
- 上下文栏约 216–272px；检查器约 280–360px；主编辑区建议至少 680px。
- 收窄先收检查器，再收上下文。保留明确重开入口，原选择、编辑位置与焦点返回关系不变。
- 矮窗口按分区独立纵向滚动；字体放大时允许文字换行与容器增高，不裁关键操作。领域长内容可整组横滚，禁止各行错位滚动。
- 主画布像素布局由页面设计另定；UI 规范约束其视觉角色、控件与状态，不替代完整页面稿。

## 2. 颜色角色

**主操作、选中、焦点分开。**

- 主操作 `action-*`：亮色 solid / hover / active 为 `#0F0F10` / `#292524` / `#000000`，文字 `#FFFFFF`。暗色反相 solid `#F6F7F9`，文字 `#0F0F10`。
- 选中 `theme-accent-*`：亮色 tint `#E0E0E0`、文字 `#20242C`；暗色 tint `#393939`、文字 `#F6F7F9`。只表达行、标签页、片段或对象的选中，不当普通卡片底。
- 焦点 `focus-accent`：亮 `#026370`，暗 `#74A9B0`。2px 外环，离控件 2px；不用于主按钮或选中填充。
- 工作面 / 面板 / 头部：亮 `#F0EFED` / `#FFFFFF` / `#F7F6F4`，暗 `#181B21` / `#20242C` / `#262B35`。
- 正文 / 次级 / 辅助：亮 `#20242C` / `#5B6577` / `#5F6B7C`，暗 `#F6F7F9` / `#B4BDCC` / `#8B95A5`。
- 分隔线用 border-subtle / soft；控件可操作边界用 border-control（亮 `#7F8A9B`，暗 `#8B95A5`）。不拿浅分隔线充当输入框边界。
- 导航轨使用 chrome-rail-*，文字 text-on-chrome 保持常亮；不得误用暗色反相后的 text-on-action。
- 语义 solid / text / bg 分开：成功 text `#047857`、警告 text `#92400E`、错误 text `#B91C1C`；亮底分别 `#F0FDF4` / `#FFFBEB` / `#FEF2F2`。正文不直接使用高亮 solid 色。

语义状态同时给图形／色点与文字。Toast 使用墨色壳 + 色点，Chip 使用中性壳 + 色点；内联反馈可以使用浅语义底。没有用户主题色盘，不恢复多外观模式。

## 3. 字体与排版

- UI：Inter / Noto Sans SC / system-ui；主标题 20/28、分组标题 16/24、正文 14/22、工具与说明 13/20。
- IPA / IGT / 例句：Charis SIL；默认 16/24，内容展示可在 14–18px 范围调整并保持足够行高。不得用于按钮、菜单、导航和 UI 标题。
- 时间码与参数：JetBrains Mono / ui-monospace；12/18，固定 LTR。
- 附标、声调、送气和长音符号不得截顶压底。字族回退仍需保证可读，不用额外空格弥补字体或对齐问题。
- 长名称单行省略时须有完整内容查看方式；不省略错误原因、状态和关键动作。正文优先换行，不能用省略号隐藏必须阅读的信息。

## 4. 间距与形状

4px 步进，优先 8px 节奏；常用 4 / 8 / 12 / 16 / 24 / 32px。正文和控件间距 12–16px，独立分组间距 24px。

- 工作面圆角 0；菜单／提示 8px；控件和对话框 10px；Chip 可用 6px。
- 按钮默认 32px、紧凑 28px；单行输入默认 32px、紧凑不低于 28px。领域编辑单元可随字号与内容增高。
- 图标统一使用同一套 Material Symbols 轮廓风格，默认 20px，紧凑伴随文字可用 16px；图标与文字间距 8px，不混用彩色 emoji。命中优先 28×28，最低 24×24；时间轴细手柄例外见领域模式。
- 列表／表格默认行高 36–44px，密度一致；不要单凭缩小字形制造紧凑感。
- 工作平面不加投影；浮层使用发丝边与轻阴影。最多两层可见容器边框，内层用间距和底色分组。

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

菜单、Tooltip、模态、非模态检查器分别使用。模态遮罩亮色基线为 #20242C / 24%，暗色可用黑色 / 48%；非模态不铺全页遮罩。Tooltip 不承载必须点击的操作；模态锁定焦点，非模态不锁整个工作面。Esc 只处理最上层可关闭层，关闭后返回原触发控件。悬停过渡建议 120–180ms，浮层进入／退出 160–220ms；减少动态时去掉位移与非必要动画。存在未处理输入时不得通过遮罩点击静默丢弃。

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

播放头是 danger 实线；循环／时间选区为中性 tint；键盘焦点是青色外环。三者不能共用同一底色。手柄可视 2px、命中至少 8px；拖动显示虚影与新起止，吸附显示引导与提示，操作拒绝说明原因。

说话人／层分轨，合法跨轨重叠可辨认。极窄片段保留边界与提示入口，隐藏放不下的长文字。时间码 LTR；本模式不决定切分或磁吸算法。

### 转写主工作区（应用主稿）

Penpot 板 **27 · 转写主工作区 · 选中与键盘焦点** 是转写壳的唯一应用主稿（SSoT）。密度、层级、选中与焦点问题改 27；不另起同类转写默认板。

同壳状态对照只改差异层：

- **29** 保存失败与草稿保留 → 反馈规则见 §5／板 09
- **43** 1280 检查器折叠、**44** 窄窗上下文折叠 → 窗口适配见 §1／板 14
- **45** 暗色同布局 → 选中 `#393939`、焦点 `#74A9B0`，见 §2／板 15

主稿须一眼可分：中性选中底、青色焦点环、danger 播放头、重叠话轮分轨。内联保存失败用浅底 `#FEF2F2` + 错误字 `#B91C1C` + 墨色重试，与焦点和未保存草稿并存，不得清稿。

### IGT

词列与语素列依据对应关系排列，列宽由同组最长内容决定；不按字符数插空格。缺 gloss 保留位置，多语素分列；长词不截断。需要滚动时横向移动整组，不允许原文、语素与 gloss 各自错位。UI 标签与研究内容字族分离。

## 8. 主题、对比与检查边界

亮暗保持相同角色，主要操作反相、导航文字常亮。选中+焦点+错误在两种模式里含义相同。字号放大不裁内容；减少动态不消失状态说明。

按 sRGB 相对亮度公式计算的基线：亮色正文／panel 15.55、次级／panel 5.88、正文／选中 11.78、CTA 19.16、焦点／panel 6.95、控件边界／panel 3.49；暗色对应 14.51、8.22、10.77、17.87、5.96、5.14。正文目标 ≥4.5，焦点及控件边界目标 ≥3。

这些只是明确颜色对的计算结果，不表示所有透明叠层、动画、屏幕阅读器或运行中的 Tab／Esc 已通过验证。UI 规范本轮不以后台功能、数据库或发布验收作为完成条件。

## 9. Penpot 目录与编辑约定

- 00 入口；01 色彩；02 排版；03 几何与密度。
- 04 按钮；05 输入；06 选择；07 导航与列表。
- 08 浮层；09 反馈；10 复合状态；11 键盘与焦点。
- 12 时间轴；13 IGT；14 桌面适配；15 主题；16 反馈与媒体变体；17 UI 检查表。

00–17 为当前 UI 规范主体。转写应用主稿与状态对照为板 27／29／43／44／45（见 §7），用规范验真实稿，不在 00–17 内复制第二套转写页样式。旧配色比较与其它产品页面样例保留在独立暂存区，非本轮规范，不与当前目录混读。正文使用可编辑图形与文本；16 保留原有 Toast / Pill 与 PanelChip 组件变体。填充优先绑定 jieyu-stitch-light 语义 token；暗色样例对应同名角色的暗色值。

现有组件映射和后台工程规格后续单独制定。代码实现仍须遵守仓库既有约束；本文件不修改产品数据语义、冻结格式或发布范围。用户可见文案接入产品时统一经过字典。

## 本轮 UI 稿核对（2026-11-01）

00–17 共 18 个章节均已读回并导出检查；文字框未超出画板边界。已修正旧自动布局造成的裁切、选区内波形密度变化、Toast 彩色描边，以及主操作／选中／焦点混用。按钮六态、表单生命周期、混合选择、复合状态、明暗对照与领域 UI 实样均在规范主体内。

此记录只确认 UI 规范稿的组织、静态实样和明确颜色对，不代表产品运行中的键盘、读屏、全部动态效果已测试；这些属于实现后的验证，工程规格后定。

### 选中底色修订

选中底从偏暖的灰改为纯中性灰：亮色 #E0E0E0，暗色 #393939；焦点青与主按钮不变。浅色选中底参考 [Carbon layer-selected](https://www.carbondesignsystem.com/building-blocks/foundations/color/tokens)；[Radix 的色阶用途](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)同样把第 5 阶用于选中／按下。暗色值是适配当前工作面后的选择，并非宣称两套系统使用同一色值。

### 转写主稿验规范（2026-11-01）

以板 27 为唯一转写主稿核对选中／焦点／播放头／分轨；板 29／43／44／45 已与 27 同壳对齐。规范缺口回补：§7 转写主工作区条目、§5 内联保存失败（浅底 + 错误字 + 墨色重试）、§9 应用主稿指针；Penpot 00／09／12／14／15／17 已加交叉引用。

### 选中 tint 代码同步（2026-11-01）

`src/styles/tokens.css` 的 `--theme-accent-tint` 已与 DESIGN／板 27／45 对齐：亮 `#E0E0E0`，暗 `#393939`。焦点 `#026370`／`#74A9B0` 此前已一致。未改 `gray-6`／`border-subtle` 等非选中语义色。
