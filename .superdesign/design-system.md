# 解语 Jieyu 桌面版 · Superdesign 设计约束

> 依据：ADR-0102（设计稿只在 Open Design）、ADR-0101（视觉方向重新探索）、ADR-0099 R01–R12、`.superdesign/stitch-ui-engineering-addendum.md` §2 起的工程规则。Open Design 的设计包从本文件导入。
> **配色、字体气质、圆角、阴影、密度风格尚未确定**，由方向探索给出；下面只写与风格无关的硬约束。方向选定后，在本文件末尾补「视觉方向」一节。

## 1. 产品是什么

- 濒危语言田野语言学家的**桌面**工作台（Electron，macOS/Windows），单人、本机工程文件夹、离线可用。
- 主要工作：录音转写（波形 + 时间轴 + 片段文本）→ 行间注释 IGT（词/词素/gloss）→ 词典 → 语料查询 → 分析复核。
- 用户长时间盯屏做精细编辑：信息密度中高、对比清楚、低干扰，不是营销页或消费 App。
- 界面语言：简体中文为主，需能切英文；内容含 IPA、多文字系统、少量 RTL。

## 2. 设计范围（真实桌面版）

| 页面 | 路由 | 要点 |
|---|---|---|
| 工程夹页 | `/desktop-project` | 工程概览、录音/文本列表、导入交换、每日备份、已删除项 |
| 转写 | `/transcription` | 波形、时间轴、片段起止/说话人/文本/备注、播放 |
| 标注 | `/annotation` | IGT 网格，键盘逐词推进 |
| 词典 | `/lexicon` | 词条浏览搜索、义项表单、附件、与标注的链接 |
| 语料 | `/corpus` | 查询、过滤、分页、定位回转写；临时工作集在桌面版显示「桌面暂不可用」 |
| 分析复核 | `/analysis` | 只读复核视图，不是完整分析编辑器 |
| 语言资产目录 | `/assets/*` | 语言元数据、结构概况、正字法、正字法桥接 |

**不要画**：协作/云同步/多人在线、写作台（`/writing` 已并入语料）、完整分析编辑器、账号登录、移动端、营销首页、自定义窗口标题栏（Electron 用系统默认窗口框）。

## 3. 画布与窗口

- 主视图 **1440×1000**；**1280×720** 下不得遮住主编辑区和保存状态。
- 应用壳：左侧窄导航轨 + 可折叠上下文栏 + 主区。栏宽、是否有右侧检查器由方向探索决定；各栏独立纵向滚动，局部工具栏保持可见。
- 窗口变窄时先收次级栏，再允许横滚；不要缩放全部文字，不要变成手机卡片布局。
- 分栏分隔 1px，拖拽命中 ≥ 6px。

## 4. 颜色语义（值待定）

只定义角色，不定值。实现时映射到 `src/styles/tokens.css` 语义变量：

- 表面：`--surface-bg`（外围底）/ `--surface-panel`（主编辑面）/ `--surface-header`（局部标题、工具条）/ `--surface-elevated`、`--surface-overlay`（浮层、模态）。
- 文字：`--text-primary` / `--text-secondary` / `--text-tertiary`（仅在验证过的底上用）。
- 边线：结构线 subtle / soft / strong；**控件识别边界单独一档**（对底色 ≥ 3:1），不要拿结构线当控件边框。
- 强调：`--theme-accent-*`（主操作、活动指示）。
- 功能状态：`--state-{success|warning|danger|info}-{text|solid|bg|border}`。**不要另造 `status-*` 平行体系。**
- 导航轨可以有专用颜色，但不能借用正文或错误色。
- **主操作、持久选中、指针悬停、键盘焦点是四种不同的东西**，视觉上必须能区分，不能合并成同一种着色。
- 亮暗两套都要给；波形、标记、选区在暗色中单独核对。媒体内容不反色。
- 对比度：正文 ≥ 4.5:1；控件边界、焦点环、关键图形 ≥ 3:1；状态不能只靠颜色（加图标或文字）。

## 5. 字体与排版

- 正文字体必须同时覆盖拉丁和简体中文；最终只能用随应用打包的本地字体或系统字体（桌面 CSP `font-src 'self'`，不能用 Google Fonts）。
- IPA 研究内容用 Charis SIL（回退 Doulos SIL / Gentium Plus），**只用于语言内容，不用于界面文字**；组合附标不能被固定行高裁切。
- 时间码用等宽字体（JetBrains Mono 一类），数字等宽、固定 LTR。
- 字阶参考：正文 14/22，密集 12/18，工具栏 13/20 中等字重，区标题 16/24，页标题 20/28。可阅读文字不得小于 12px。
- 用户可放大字号：所有高度都是 min-height，放大后不能截字。

## 6. 控件与现有组件（必须复用，不另建组件库）

| 组件 | 文件 | 真实接口 |
|---|---|---|
| `PanelButton` | `src/components/ui/PanelButton.tsx` | variant: default / primary / ghost / danger / success；size: default 32px / sm 28px / compact 28px |
| `FormField` | `src/components/ui/FormField.tsx` | label / htmlFor / hint / error / span；常驻 label，error 优先于 hint |
| `ModalPanel` / `DialogShell` / `DialogOverlay` | `src/components/ui/` | isOpen / onClose / title / footer / closeDisabled |
| `PanelFeedback` | `src/components/ui/PanelFeedback.tsx` | level: error / warn / info |
| `PanelChip` | `src/components/ui/PanelChip.tsx` | variant: default / warning / danger / success；只放短元信息 |
| `PanelSection` / `PanelNote` / `PanelSummary` | `src/components/ui/` | 分组标题 / 说明 / 确认摘要，不升级成卡片或主操作区 |
| `JieyuIcon` | `src/components/ui/JieyuIcon.tsx` | Lucide 图标名；16 / 20px |

- 点击目标 ≥ 24×24；常用图标按钮 32×32；重要任务入口最小高 36px（场景规格，不加新 size）。
- 间距刻度 4 / 8 / 12 / 16 / 24 / 32。
- 每种控件都要能表达：默认、悬停、按下、焦点、禁用、加载、出错。禁用不靠整体降透明度让文字看不清；加载时保留标签和宽度。
- 危险操作与取消并置，危险按钮不默认聚焦。

## 7. 容器层级

- 同一视觉路径上**最多两层带边框的容器**（壳 → 区域面板）；第三层起用背景色差、间距、圆角区分。分隔线、表单控件原生边框、交互态边框不计。
- 不要卡片套卡片；不要为了好看把列表每行做成卡片。
- 浮层顺序：内容 < sticky < 导航 < 非模态面板 < 菜单 < tooltip < 模态 < 完整性阻断。

## 8. 编辑状态（专业编辑器必画）

- 不同通道叠加，不互相遮盖：当前层（层头标记）/ 选中（区域底色 + 计数）/ 当前活动片段（侧标）/ 输入焦点（2px 轮廓 + 2px 偏移）/ 拖动预览 / 草稿 dirty、saving、error（固定状态位 + 失败文案 + 重试）。
- 优先级：数据丢失或写入失败的提示 > 输入焦点 > 拖动预览 > 活动/选中 > 悬停。
- AI 置信度与人工判断（确信 / 存疑 / 跳过）是两种标记，不能混用。
- 时间轴：边界拖动显示旧范围、新时间、时长；选区、循环区、播放头、吸附线形状或线型各不相同；窄片段保留可定位标记，文字不缩到 12px 以下。
- IGT：词边界列 + 语言行网格，长词可扩展，行标签（原文 / 词 / 词素 / gloss / 译文）可见；候选分析不能着色成已确认。

## 9. 每页必须覆盖的状态

空、加载、保存中、保存失败且草稿保留、改正文后待复核、只读或不可用、暗色。键盘：Tab 顺序、焦点可见、输入法组合期间 Enter 不提交、离开页面时有未保存草稿要拦截（R02）。

## 10. 文案与数据

- 稿中**只用合成数据**：虚构语言名、虚构说话人、虚构 IPA 例句。**不得使用任何真实田野语料**（包括木雅语）。
- 不写虚构能力或状态：不画“已同步”“已上线”“已核验”，没实现的按钮不画。
- 快捷键按平台显示（Mac Cmd，其他 Ctrl），不发明不存在的组合。
- 文案最终进字典（`dictKeys`），稿中文字只是示意。

## 11. 交付与实现边界

- Superdesign 导出的 HTML（CDN Tailwind、Google Fonts、iconify）**只作视觉参考，不进代码**。
- 实现时：颜色 → `tokens.css` 语义变量（新方向注册为新外观，见 `src/utils/theme.ts`）；图标 → `JieyuIcon`；控件 → 上表组件。
- 精稿交付附组件映射表：区域 | 文件 | 复用方式 | CSS owner | desktopCall / Query key。

## 视觉方向

（待 S1 方向探索选定后补写：配色值、字体、圆角、阴影、密度。）
