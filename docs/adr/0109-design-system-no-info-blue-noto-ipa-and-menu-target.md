---
title: ADR 0109 - 设计系统收口：去除信息蓝、IPA 统一 Noto、完整菜单终态与嵌入媒体规则
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0103-paper-field-notes-is-the-only-appearance.md
  - ./0106-design-system-package-lives-in-repo.md
  - ./0107-motion-compact-height-selection-and-shortcuts.md
---

# ADR 0109：设计系统收口：去除信息蓝、IPA 统一 Noto、完整菜单终态与嵌入媒体规则

## 背景

在按「纸本田野笔记」（[ADR-0103](./0103-paper-field-notes-is-the-only-appearance.md)–[ADR-0108](./0108-control-border-contrast-3-to-1.md)）开始各页面重设计前，核查设计系统包 `design/jieyu-paper/` 与既有 ADR，仍有几处前后不一：

- `DESIGN.md` frontmatter 仍保留 `state-info-solid` / `state-info-text`（`#1D4ED8`），但正文、`tokens.css` 与 `colors.html` 里既无定义也无禁令。
- [ADR-0103](./0103-paper-field-notes-is-the-only-appearance.md) 第 3 条写「IPA 先用 Noto Sans，缺字再回退 Charis SIL」，`--font-ipa` 末尾带 `serif` 回退，与正文无衬线混排时字形割裂。
- `DESIGN.md` §5 与 `preview/components-desktop.html` 规定八列完整应用菜单（工具栏动作均在菜单栏可查、不可用置灰），而 [ADR-0107](./0107-motion-compact-height-selection-and-shortcuts.md) 第 4 条写「按 Electron 默认菜单结构重建应用菜单，其余菜单不变」，两者未分清终态规格与当前骨架过渡。
- 转写主工作区在 `DESIGN.md` §7 定为「无右栏检查器、无底部当前片段页，正文在时间轴选中块内就地编辑」，切片 1 差额单却仍写「主区含当前片段原文·译文」。
- 第三方嵌入视图（地图底图、PDF、视频）缺少文字规则；预览页里还留有与已拍板产品决策相悖的示意文案（本地通用模型提示、14 天备份、30 天回收站）以及导入器遗留的 `.od-generated.json`。

## 决定

1. **没有第四种语义蓝色。** 从 `DESIGN.md` frontmatter 移除 `state-info-*`。语义色只有成功、警告（含待复核）、失败三种；一般信息提示统一用中性浅灰底或墨色壳加墨点，不使用蓝色强调或蓝色信息底。代码存量 `--state-info-*` 随各页面重设计逐页清退。
2. **IPA 统一走 Noto Sans，全部 Noto 字体随应用打包。** 局部替换 [ADR-0103](./0103-paper-field-notes-is-the-only-appearance.md) 第 3 条中的「缺字再回退 Charis SIL」：不使用也不打包 Charis SIL，`--font-ipa` 改为 `'Noto Sans', sans-serif`；界面、衬线标题、等宽时间码与 IPA 所用的 Noto 字体族全部随应用打包，不从网络加载。
3. **完整应用菜单是桌面终态规格，[ADR-0107](./0107-motion-compact-height-selection-and-shortcuts.md) 第 4 条仅为当前骨架过渡。** `DESIGN.md` §5 与 `preview/components-desktop.html` 的菜单结构保留为桌面版目标规格（工具栏动作在菜单栏可查、快捷键以 `KeybindingService` 为准、不可用项置灰不隐藏）；当前 Electron 骨架阶段仅先让出 `⌘M`，随桌面工作区切片推进再补齐菜单与状态同步。
4. **转写主工作区不设底部「当前片段」区。** 原文与译文统一在时间轴选中块内就地编辑，无右栏检查器、无底部当前片段面板；切片 1 差额单与规格按此统一。
5. **嵌入媒体与文档规则写进 `DESIGN.md`，不新增静态预览页。** 第三方地图默认使用灰阶底图与墨色标记，彩色卫星／地形底图仅在用户主动切换时显示；PDF 查看器与视频面板贴合所属分栏，不另套卡片边框与投影，视频与波形共用播放头。路线图合同界面与各工作区的暗色／窄窗对照不进设计系统静态样板，直接在 Open Design 逐片精稿中交付。
6. **清理设计系统包。** `DESIGN.md` 图标入口名更正为 `JieyuIcon`，frontmatter 字体栈与 `--font-sans` / `--font-display` 对齐；预览页校准为每日快照保留 3 份、回收站 90 天（[ADR-0087](./0087-project-deletion-retention-and-media-cleanup.md)）及云端密钥配置说明；删除导入器遗留的 `design/jieyu-paper/.od-generated.json`。

## 未选方案

- **保留 `state-info-*` 只给纯信息提示**：纸面墨色体系里中性壳加墨点已足够表达非警告提示，留蓝色语义极易在重设计时再次滑向蓝色强调。
- **保留 Charis SIL 作为 IPA 回退**：混排时衬线回退与 Noto Sans 字重、x-height 不一致，且多维护一套字体许可与打包体积。
- **按 ADR-0107 缩减设计系统菜单**：桌面专业工具需要菜单栏承载完整动作与键位可发现性，不应把过渡期最小实现当成设计终态。
- **在 `design/jieyu-paper/preview/` 扩建路线图各页样板**：页面级状态与布局归 Open Design 逐片精稿，塞进基础组件包只会制造第二套静态页面维护负担。

## 影响

- `src/styles/tokens.css` 的 `--font-ipa` 更新后，须重新运行 `npm run build:od-tokens` 同步 `design/jieyu-paper/tokens.css`。
- 本次只收口设计系统包、令牌真源与关联计划／规格文档；运行中各页面的存量样式与字体文件打包在后续各切片重设计及桌面打包任务中逐页落地。
