---
title: CSS治理执行记录
doc_type: architecture-log
status: active
owner: repo
last_reviewed: 2026-04-09
source_of_truth: css-governance-execution-log
---

# CSS治理执行记录

用于记录 CSS 治理的固定节奏执行证据：预算复盘、兼容矩阵复核、视觉基线更新与废弃窗口推进。

## 记录模板

1. 日期
2. 执行人
3. 执行命令
4. 关键结果
5. 发现问题
6. 下一轮动作

## 2026-04-08 首次记录

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run lint:css`
   - `npm run check:css-architecture`
   - `npm run check:css-a11y`
   - `npm run check:css-compat`
   - `npm run check:css-naming-convention`
   - `npm run check:css-unused-selectors`
   - `npm run check:css-deprecation-window`
   - `npm run test:visual-css`
   - `npm run check:build-budgets`
3. 关键结果：
   - 命名豁免已清零（`panelFilesWithoutPnlRoot=0`）。
   - 废弃窗口机制开始实操（4个历史根类登记）。
   - 视觉基线与兼容矩阵校验通过。
4. 发现问题：
   - 未使用选择器仍存在存量，需要按季度燃尽。
5. 下一轮动作：
   - 2026-Q2 内完成 AST unused 统计净下降目标。
   - 2026-Q2 内完成首批历史根类移除前的兼容替换。

## 2026-04-08 Phase 1-2 落地

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run report:css-debt-thresholds`
   - `npm run check:css-important-whitelist`
   - `npm run check:css-ownership`
   - `npm run check:css-deprecated-usage`
   - `npm run check:css-architecture`
3. 关键结果：
   - 建立 CSS 债务阈值配置，开始按总量 ceiling 和目标值双轨治理。
   - 建立 `!important` 白名单与 stale entry 清理机制。
   - 将 `.btn`、`.input`、`.select-caret`、`.icon-btn` 根定义收口到 `foundation/control-primitives.css`。
   - 新增废弃类 usage 扫描，避免“样式已迁移但源码仍回退”问题。
4. 发现问题：
   - 旧的 duplicate/unused 存量仍然较高，后续需要按阈值持续燃尽。
5. 下一轮动作：
   - 继续将页面层上下文覆盖与通用 primitive 变体拆分成明确 owner。
   - 在下一阶段接入截图回归与更完整的交互 a11y 契约。

## 2026-04-09 Duplicate 口径收口

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-dup-selectors`
   - `npm run check:css-debt-thresholds`
   - `npm run test:visual-css:write-baseline`
   - `npm run check:css-architecture`
3. 关键结果：
   - duplicate selector 统计改为只计算根定义类，移除了 contextual override 与 `is-*` 状态类噪声。
   - duplicate debt 从 112 收敛到 34，并已把新的 ceiling 写回阈值与 baseline。
   - `AiChatMetricsBar` 的 5 处 inline style 已迁回样式文件，inline debt 收敛到 93。
4. 发现问题：
   - 未使用选择器仍有 251，需要后续按域拆分清理，而不是继续通过 duplicate 指标侧推。
5. 下一轮动作：
   - 以 unused selector 为下一条主线，按页面/面板域做净减。
   - 对剩余 34 个根定义重复类继续按 owner 评估是否值得合并或保留白名单。

## 2026-04-09 Unused Scanner 收口

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-unused-selectors`
   - `npm run check:css-debt-thresholds`
3. 关键结果：
   - unused selector scanner 升级为 AST + 结构化源码引用识别，并补上测试文件中的字符串/正则类名引用。
   - scanner 进一步识别 `joinClassNames(...)` 与其中的模板动态类名，避免把共享 UI 原语误判为死代码。
   - scanner 再补 `className={[...].join(' ')}`、任意 `*ClassName` 转发 props、对象字面量里的 `className` / `*ClassName`、DOM `.className = ...`、`classNamePrefix` 与模板条件分支字面量，避免数组拼类、壳层转发、运行时赋类与 react-select 生成类继续误报。
   - scanner 再补“包含 className 语义文件的字符串/模板兜底识别”，并将 `maplibregl-*` 运行时前缀从 unused debt 中排除，消除了剩余误报尾项。
   - 同步删除 orthography-workspace、language-metadata-workspace、ai-hub、analysis-panel、ai-sidebar-shell、transcription-toolbar、layer-list、voice-agent 中确认无引用的历史尾项规则。
   - 将 `RecoveryBanner`、`ErrorBoundary`、`ProjectSetupDialog`、`LayerActionPopover`、`OrthographyBridgeManager` 与 `SidePaneSidebarLayerRow` 的静态内联样式回迁后，inline debt 从 93 降到 82。
   - unused debt 从 251 收敛到 0，说明此前绝大多数存量属于扫描口径缺失而非真实死代码。
   - Phase 3 的 unused selector 主债务已清零，后续重点转为 duplicate root class 与剩余 inline style 动态场景治理。
4. 发现问题：
   - duplicate root class 仍有 34 个，且业务级 owner 约束尚未覆盖这些重复类；成熟度短板已从 unused 切换到 ownership/dup 约束不足。
5. 下一轮动作：
   - 继续收紧 duplicate root class 的 owner 收口，优先处理 `voice-agent-engine-select`、`transcription-analysis-toolbar-title`、`transcription-analysis-tab-content` 等跨文件重定义。
   - 继续回迁明显静态的 inline style，优先处理 `RecoveryBanner`/`ErrorBoundary` 之外的全静态按钮与容器。

## 2026-04-09 Duplicate Owner 再收口

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `node scripts/check-css-dup-selectors.mjs`
   - `node scripts/check-css-debt-thresholds.mjs`
   - `node scripts/check-css-dup-selectors.mjs --write-baseline`
   - `node scripts/test-visual-css-baseline.mjs --write-baseline`
3. 关键结果：
   - 将 `AiAnalysisPanel` 的移动端补丁收口为数据宿主选择器，消除了 `transcription-analysis-toolbar-title`、`transcription-analysis-tab-content` 以及 hub tab 的重复根类漂移。
   - 将 `VoiceAgentWidget` 的下拉箭头外观回收到共享 primitive `select-caret`，并删除 `grounding-context.css` 中漂移的 `voice-agent-engine-select` 根定义。
   - 将 chat composer 的 `ai-chat-input` 特化规则改成 `.ai-chat-composer` 宿主限定，避免把业务变体继续计入根类重复。
   - 将 `dialog-card` 相关复合选择器改为具体弹窗宿主类，保持命中范围不变的同时去掉一整组重复根类。
   - duplicate debt 从 34 进一步收敛到 26，并同步收紧阈值与 baseline。
4. 发现问题：
   - 剩余重复项已集中在 `transcription-voice-dock`、`wave-canvas`、`transcription-waveform` 以及部分 orthography builder 宿主类，后续需要继续按 owner 和场景边界拆分。
5. 下一轮动作：
   - 继续处理 `transcription-voice-dock` / `transcription-voice-bubble` 这类跨 foundation 与业务面板的双重 owner。
   - 审核 `wave-canvas`、`transcription-waveform`、`orthography-builder-*` 是否能继续改为宿主限定或基础 owner 单点定义。

## 2026-04-09 Duplicate Owner 再收口（二）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `node scripts/check-css-unused-selectors.mjs`
   - `node scripts/check-css-dup-selectors.mjs`
   - `node scripts/check-css-debt-thresholds.mjs`
   - `node scripts/check-css-dup-selectors.mjs --write-baseline`
   - `node scripts/test-visual-css-baseline.mjs --write-baseline`
3. 关键结果：
   - 通过代码引用分析确认 `VoiceDockSection` 已无任何调用方，`transcription-voice-dock*` 不再是活跃双 owner，而是整套历史残留实现。
   - 删除已废弃的 VoiceDockSection 历史浮层实现，并将保留能力收口到 [src/components/VoiceAgentWidget.tsx](src/components/VoiceAgentWidget.tsx)；同步清理 `voice-agent.css`、`media-controls.css`、`ai-hub.css` 中对应的废弃浮层样式，并移除未再使用的 i18n 文案键。
   - 继续清理 `grounding-context.css` 中依赖 `transcription-voice-dock-idle` 的历史上下文规则，保证 unused debt 维持为 0。
   - duplicate debt 从 26 进一步收敛到 23，首次低于上一轮的 target 24，并已同步收紧阈值与 baseline。
4. 发现问题：
   - 剩余重复项主要集中在 `wave-canvas`、`transcription-waveform`、波形工具栏以及 `orthography-builder-*` 这两组 owner 边界。
5. 下一轮动作：
   - 继续处理 `wave-canvas` / `transcription-waveform`，优先拆分 foundation owner 与页面宿主限定。
   - 再处理 `orthography-builder-*` 组，确认是共享组件 owner 还是页面壳层上下文覆盖。

## 2026-04-09 Duplicate Owner 再收口（三）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-dup-selectors`
   - `npm run check:css-debt-thresholds`
   - `npm run check:css-unused-selectors`
   - `npm run check:css-dup-selectors:write-baseline`
   - `npm run test:visual-css:write-baseline`
3. 关键结果：
   - 将 `orthography-manager-panel.css` 中页面壳层对 `orthography-builder-*` 与 `panel-section*` 的复合 root selector，改为由 `orthography-manager-*` 宿主类单独持有页面级布局与视觉差异。
   - 保留 `OrthographyManagerPanel` DOM 上的 shared builder class，用于继续承接 `orthography-builder.css` 的组件级基础样式，但不再让页面样式文件成为这些 shared root 的第二 owner。
   - 一次性消除了 `orthography-builder-panel`、`orthography-builder-group`、`orthography-builder-group-title`、`orthography-builder-hint`、`orthography-builder-advanced-group`、`orthography-builder-workspace-note`、`panel-section`、`panel-section__body` 这批重复根类。
   - duplicate debt 从 19 进一步收敛到 11，并同步刷新 duplicate baseline、visual CSS baseline 与 debt threshold。
4. 发现问题：
   - 剩余重复项已经收敛到转写壳层与基础设施边界，主要包括 `dialog-field`、`timeline-scroll`、`transcription-list-toolbar*`、`transcription-workspace*`、`app-shell-transcription` 以及 `voice-agent-settings-grid`。
5. 下一轮动作：
   - 继续处理 `transcription-list-toolbar*` 与 `transcription-workspace*`，优先把页面壳层 patch 收回宿主限定，避免继续占用 shared root owner。
   - 复查 `dialog-field` 与 `voice-agent-settings-grid`，确认哪些是共享 primitive，哪些仍然是业务层漂移定义。

## 2026-04-09 Duplicate Owner 再收口（四）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-dup-selectors`
   - `npm run check:css-debt-thresholds`
   - `npm run check:css-unused-selectors`
   - `npm run check:css-dup-selectors:write-baseline`
   - `npm run test:visual-css:write-baseline`
3. 关键结果：
   - 将 `TranscriptionPage.AiPanelHandle`、`transcription-toolbar.css`、`layer-list.css` 中剩余的壳层上下文规则继续收口到真实宿主，完成 `transcription-list-toolbar*`、`transcription-workspace*`、`dialog-field`、`timeline-scroll`、`voice-agent-settings-grid` 之后的最后一轮清理。
   - 为 `WaveformToolbar` 增加显式宿主类 `transcription-wave-toolbar-shell-has-right-controls`，把原来依赖 `app-shell-transcription` 的浮动右侧控制区布局收回组件 owner，消除 `app-shell-transcription` 的重复 root owner。
   - 将 `layer-list.css` 中 portaled 侧栏的样式根从 `app-side-pane-body-slot` 改为真实的 `.transcription-side-pane-portaled-stack`，消除 `app-side-pane-body-slot` 的重复 root owner。
   - 删除已无 JSX 调用方的 `.transcription-wave-toolbar-right-portaled` 历史规则，连同 `app-left-rail-bottom-slot` 的上下文 owner 一并退场。
   - duplicate debt 从 11 继续收敛到 0，并同步把 duplicate threshold 压到 0，进入“新增即回归”的守门状态。
4. 发现问题：
   - `src/pages/TranscriptionPage.layoutGuard.test.ts` 中 `SidePaneActionModal` 宽度断言当前仍指向已漂移的旧选择器，和本轮 duplicate owner 收口无直接关系，需要后续单独修正或重基线。
5. 下一轮动作：
   - 继续处理剩余 `inlineStyleOccurrences=82`，优先从纯静态容器和按钮开始回迁。
   - 将 `TranscriptionPage.layoutGuard.test.ts` 中与当前样式真实 owner 不一致的历史断言独立清理，避免其继续污染 CSS 治理回归信号。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（一）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npx vitest run src/pages/TranscriptionPage.layoutGuard.test.ts`
   - `npm run check:css-debt-thresholds`
   - `npm run test:visual-css:write-baseline`
3. 关键结果：
   - 将 `TranscriptionPage.layoutGuard.test.ts` 中 `SidePaneActionModal` 的断言从过时的复合选择器 `.side-pane-action-modal.dialog-card` / `.side-pane-action-modal-speaker.dialog-card` 改为当前真实 owner 结构：foundation `dialog-card` + panel `side-pane-action-modal*`，布局守卫重新全绿。
   - 把 `PdfViewerRenderer`、`VideoPlayer`、`TimelineLaneHeader`、`TranscriptionPage.ReadyWorkspace` 中一批纯静态 inline style 回迁到 owner stylesheet，覆盖 PDF 预览容器、video 元素宿主、时间轴头部拖拽指示线、隐藏文件输入与底部工具栏分隔条等低风险场景。
   - inline debt 从 82 收敛到 70，并同步把 threshold 收紧到 `max=70 / target=68 / warnAt=70`。
4. 发现问题：
   - 剩余 inline 主要集中在波形覆盖层、文本时间轴宽度/定位、TimeRuler 与少量视频进度动态样式，已经从“静态样式遗留”切换为“动态布局参数”主导。
5. 下一轮动作：
   - 继续优先处理可通过 CSS variable 承接的动态尺寸与定位，先啃 `OrchestratorWaveformContent`、`TranscriptionTimelineTextOnly`、`TimeRuler` 三个高值文件。
   - 若继续刷新视觉基线，保持与本轮 owner stylesheet 变更一起提交，避免基线和 debt 阈值脱节。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（二）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-debt-thresholds`
   - `npm run check:css-unused-selectors`
   - `npx vitest run src/components/AudioImportDialog.test.tsx src/components/PdfViewerPanel.test.tsx src/components/transcription/LeftRailProjectHub.test.tsx`
   - `npm run check:css-inline-style:write-baseline`
   - `npm run test:visual-css:write-baseline`
3. 关键结果：
   - 将 `AudioImportDialog`、`LeftRailProjectHub`、`PdfPreviewSection`、`WaveformOverviewBar` 中确认静态的 inline style 回迁到 owner stylesheet，并删除 `SidePaneActionModal` 上已被 `hidden` 属性语义覆盖的 `display:none` 内联样式。
   - 新增 `audio-import-dialog-file-input` 与 `left-rail-project-hub-file-input` 两个显式宿主类，避免继续在组件树里散落隐藏 input 的 `style={{ display: 'none' }}`。
   - 将 `transcription-pdf-preview-iframe` 的静态尺寸与背景收口回 `pdf-preview-embed.css`，让 Pdf 预览 iframe 与样式 owner 保持一致。
   - inline debt 从 70 继续收敛到 65，并同步把 threshold 收紧到 `max=65 / target=63 / warnAt=65`。
4. 发现问题：
   - 剩余高位项已几乎全部是时间轴、波形、视频进度条等运行时几何参数，后续如果继续下降，优先级应放在“减少真实动态 style 需求”，而不是简单改写成非 `style={{` 形态。
5. 下一轮动作：
   - 聚焦 `OrchestratorWaveformContent`、`TranscriptionTimelineTextOnly`、`TimeRuler`，只处理能被组件宿主变量或布局结构真正吸收的动态样式。
   - 保持 inline baseline 与 debt threshold 同步收紧，避免出现“门禁通过但基线仍滞后”的口径漂移。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（三）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-inline-style`
   - `npm run check:css-debt-thresholds`
   - `npm run check:css-unused-selectors`
   - `npm run test:visual-css`
   - `npm run check:css-inline-style:write-baseline`
   - `npm run test:visual-css:write-baseline`
3. 关键结果：
   - 将 `AiChatCandidateChips` 中两处纯静态 inline style 回迁到 `ai-hub.css`，把候选 chips 的容器布局与 chip 尺寸重新收回 owner stylesheet。
   - 将 `BatchOperationPanel` 中仅用于小跳转按钮的静态字号与内边距回迁到 `batch-operation.css`，保留真正依赖运行时坐标与文本测量的动态样式不动。
   - inline debt 从 65 继续收敛到 59，并同步把 threshold 收紧到 `max=59 / target=57 / warnAt=59`。
   - unused selector 维持 0，说明新增宿主类已全部被 JSX 真正引用。
4. 发现问题：
   - 剩余 inline 高位项已更加集中在波形、时间轴和视频等几何驱动区域，下一轮收益会明显依赖结构性改造，而不是继续搬运静态样式。
5. 下一轮动作：
   - 优先检查 `OrchestratorWaveformContent` 与 `TranscriptionTimelineTextOnly` 中是否存在可被 CSS variable 承接的宽度/位移参数。
   - 保持 visual baseline、inline baseline 与 debt threshold 同步更新，避免治理记录落后于实际仓库状态。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（四）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-inline-style`
   - `npm run check:css-debt-thresholds`
   - `npm run check:css-unused-selectors`
   - `npm run test:visual-css`
   - `npm run check:css-inline-style:write-baseline`
   - `npm run test:visual-css:write-baseline`
3. 关键结果：
   - 将 `TimeRuler` 的主刻度线与主刻度标签从绝对定位 HTML 节点改为 SVG 覆盖层，去掉两处仅用于 `left` 定位的 inline style，同时保留时间游标与密度热力条现有结构。
   - inline debt 从 59 继续收敛到 57，命中上一轮 target，并同步把 threshold 收紧到 `max=57 / target=55 / warnAt=57`。
   - duplicate root 与 unused selector 继续维持 0，说明本轮结构替换没有引入新的 owner 漂移或死类。
4. 发现问题：
   - 剩余 inline debt 已基本集中在波形、时间轴项与视频布局的真实运行时几何参数，继续下降会更依赖组件结构调整而非局部样式回迁。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先评估 `OrchestratorWaveformContent` 中可被 SVG 或轨道结构吸收的定位标记。
   - 保持“目标值命中后立即收紧 threshold + baseline”的治理节奏，避免口径滞后。
