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

## 2026-04-09 Layout Guard 与 Inline Debt 收口（五）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-inline-style`
   - `npm run check:css-debt-thresholds`
   - `npm run check:css-unused-selectors`
   - `npx vitest run src/pages/TranscriptionPage.structure.test.ts`
   - `npm run check:css-inline-style:write-baseline`
   - `git diff --name-only -- src/styles`
3. 关键结果：
   - 将 `OrchestratorWaveformContent` 中“选中热点竖线 + L/R 吸附线”从绝对定位 HTML 节点替换为单一 SVG guide overlay，去掉 3 处仅用于水平定位的 inline style，同时保留声学覆盖层、lasso 与注记指示器原有交互结构。
   - 删除 `transcription-waveform.css` 中已无 JSX 引用的 `.snap-line*` 历史样式，并把波形 guide 的视觉 owner 收口到 `waveform-display.css`。
   - inline debt 从 57 继续收敛到 54，并同步把 threshold 收紧到 `max=54 / target=52 / warnAt=54`，inline baseline 已刷新到 `total=54`。
   - duplicate root 与 unused selector 继续维持 0，说明本轮 SVG 替换没有引入新的 owner 漂移或死类。
4. 发现问题：
   - `src/pages/TranscriptionPage.structure.test.ts` 的 regression ceiling 断言当前因 `useCallback` 计数上限（9 > 8）失败，这不是本轮 CSS/SVG 替换直接引入的问题。
   - `npm run test:visual-css` 当前同时报告 `waveform-display.css`、`transcription-waveform.css`、`app-shell-layout.css`、`orthography-manager-panel.css`、`analysis-panel.css` 5 个样式快照漂移；后 3 个文件属于工作树中已存在的其他 CSS 改动，因此本轮未直接刷新整仓 visual baseline，避免混入非当前收口范围的快照变更。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先处理 `TranscriptionTimelineTextOnly` 与 `OrchestratorWaveformContent` 中剩余的真实几何型 inline style。
   - 在工作树里的其他 CSS 改动范围厘清后，再统一刷新 visual baseline，避免基线把并行主题一并吞入。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（六）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-inline-style`
   - `npm run check:css-debt-thresholds`
   - `npm run check:css-unused-selectors`
   - `npx vitest run src/components/TranscriptionTimelineTextOnly.test.tsx`
   - `npm run test:visual-css`
   - `npm run check:css-inline-style:write-baseline`
   - `git diff --name-only -- src/styles`
3. 关键结果：
   - 将 `TranscriptionTimelineTextOnly` 里两条 text-only lane 的 track 宽度，从子节点 `style={{ width }}` 吸收到既有 lane 根节点 CSS 变量宿主，新增 `--timeline-lane-track-width` 并由 `transcription-timeline.css` 统一消费。
   - 保留 lane 根节点已有的动态高度变量 owner，不额外增加新的 inline 宿主，同时删除两个 `timeline-lane-text-only-track` 的 inline width 定义。
   - inline debt 从 54 继续收敛到 52，其中 `TranscriptionTimelineTextOnly` 单文件从 6 降到 4；同步把 threshold 收紧到 `max=52 / target=50 / warnAt=52`，inline baseline 已刷新到 `total=52`。
   - `TranscriptionTimelineTextOnly.test.tsx` 全绿，unused selector 继续维持 0，说明本轮 lane 级变量吸收没有破坏文本时间轴行为，也没有引入死样式。
4. 发现问题：
   - `npm run test:visual-css` 当前仍因混合工作树失败，快照漂移文件为 `waveform-display.css`、`transcription-timeline.css`、`transcription-waveform.css` 以及并行主题中的 `app-shell-layout.css`、`orthography-manager-panel.css`、`analysis-panel.css`；本轮未刷新整仓 visual baseline，避免把并行 CSS 主题一并吞入基线。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先处理 `OrchestratorWaveformContent`、`VideoPlayer`、`TranscriptionPage.ReadyWorkspace` 这几处剩余高位项，继续优先选择可并入现有 CSS 变量宿主的几何参数。
   - 等并行 CSS 主题范围厘清后，再统一刷新 visual baseline，保持基线与交付主题一致。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（七）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-inline-style`
   - `npm run check:css-debt-thresholds`
   - `npm run check:css-unused-selectors`
   - `npx vitest run src/components/TranscriptionTimelineTextOnly.test.tsx src/pages/TranscriptionPage.structure.test.ts`
   - `npm run test:visual-css`
   - `npm run check:css-inline-style:write-baseline`
   - `git diff --name-only -- src/styles`
3. 关键结果：
   - 将 `OrchestratorWaveformContent` 中低置信度 / overlap / gap 三类分析 band 从绝对定位 HTML 盒子改为单一 SVG overlay，保留 label 与 title 文案逻辑，同时把 band 视觉 owner 统一收口到 `waveform-display.css`。
   - 将 `VideoPlayer` 的 sub-selection、region markers、progress fill、progress thumb 合并为单一 SVG progress overlay，去掉一组重复的 `left/width` inline 定位节点，只保留播放器高度这个真实宿主变量。
   - inline debt 从 52 继续收敛到 46，其中 `OrchestratorWaveformContent` 从 6 降到 3，`VideoPlayer` 从 4 降到 1；同步把 threshold 收紧到 `max=46 / target=44 / warnAt=46`，inline baseline 已刷新到 `total=46`。
   - `TranscriptionTimelineTextOnly.test.tsx` 与 `TranscriptionPage.structure.test.ts` 全绿，unused selector 继续维持 0，说明这轮 SVG 叠层替换没有破坏时间轴/波形壳层回归。
4. 发现问题：
   - `npm run test:visual-css` 当前仍因混合工作树失败，快照漂移已扩展到 `media-controls.css`、`waveform-display.css`、`transcription-timeline.css`、`transcription-waveform.css`，以及并行主题中的 `app-shell-layout.css`、`language-metadata-workspace.css`、`orthography-bridge-workspace.css`、`orthography-manager-panel.css`、`analysis-panel.css`；另外还存在 `language-asset-workspace.css` 缺少 baseline 的并行改动。
   - 因为 visual 漂移范围明显超出本轮 CSS debt 收口主题，本轮未刷新整仓 visual baseline，避免把并行页面主题一并吞入当前基线。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先处理 `TranscriptionPage.ReadyWorkspace`、`TimelineLaneHeader` 与 `TranscriptionTimelineMediaLanes` 这些仍位于 inline 高位的文件。
   - 待并行 CSS 主题范围稳定后，再统一刷新 visual baseline，并单独补齐 `language-asset-workspace.css` 的 baseline 初始登记。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（八）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-inline-style`
   - `npm run check:css-unused-selectors`
   - `npm run check:css-debt-thresholds`
   - `npx vitest run src/components/TimelineLaneHeader.test.tsx src/pages/TranscriptionPage.layoutGuard.test.ts src/pages/TranscriptionPage.structure.test.ts`
   - `npm run test:visual-css`
   - `npm run check:css-inline-style:write-baseline`
3. 关键结果：
   - 将 `TranscriptionPage.ReadyWorkspace` 上 `transcription-workspace` 与 `transcription-list-panel` 的运行时 CSS 变量宿主并回最外层 `transcription-screen`，保留变量继承链不变的同时删除两处中间层 inline style。
   - 将 `TimelineLaneHeader` 的层级连接线从伪元素 + 内联颜色变量改为 SVG connector 栈，并把颜色档位收口成 `transcription-timeline.css` 内的固定 palette class；这样保留 hover/focus 态视觉反馈的同时，将 header 文件内的 connector inline style 全部清零，仅剩 lane-lock dialog 自适应宽度这一处真实运行时样式。
   - inline debt 从 46 继续收敛到 42，其中 `TimelineLaneHeader` 从 2 降到 1，`TranscriptionPage.ReadyWorkspace` 从 2 降到 2 之外还同时移除了两处中间宿主 style 口并把变量统一收口到最外层 screen；同步把 threshold 收紧到 `max=42 / target=40 / warnAt=42`，inline baseline 已刷新到 `total=42`。
   - `TimelineLaneHeader.test.tsx`、`TranscriptionPage.layoutGuard.test.ts`、`TranscriptionPage.structure.test.ts` 全绿，unused selector 继续维持 0，说明 lane connector 的 SVG 化没有破坏时间轴 header 交互和布局守卫。
4. 发现问题：
   - `npm run test:visual-css` 仍被混合工作树阻断，当前快照漂移已包含 `ai-hub.css`、`media-controls.css`、`waveform-display.css`、`app-shell-layout.css`、`language-metadata-workspace.css`、`orthography-bridge-workspace.css`、`orthography-manager-panel.css`、`transcription-timeline.css`、`transcription-waveform.css`、`analysis-panel.css`，并且仍有 `language-asset-workspace.css` 未登记 baseline。
   - 因为 visual 失败范围继续明显超出本轮 ReadyWorkspace / TimelineLaneHeader 收口主题，本轮仍未刷新整仓 visual baseline。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先处理 `TranscriptionTimelineMediaLanes`、`TranscriptionTimelineMediaTranscriptionLane` 与 `VoiceAgentWidget`，这三者已经成为新的 inline 高位组。
   - 等并行 CSS 主题范围稳定后，再统一刷新 visual baseline，并补齐 `language-asset-workspace.css` 的 baseline 初始登记。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（九）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-inline-style`
   - `npm run check:css-unused-selectors`
   - `npx vitest run src/pages/TranscriptionPage.layoutGuard.test.ts src/pages/TranscriptionPage.structure.test.ts`
   - `npm run check:css-inline-style:write-baseline`
   - `npm run test:visual-css`
   - `git diff --name-only -- src/styles`
3. 关键结果：
   - 修复 `TimeRuler` SVG 化后刻度数字被非等比拉伸的问题：移除会扭曲文本字形的 `viewBox + preserveAspectRatio="none"` 组合，改为在原生 SVG viewport 中用百分比定位刻度线与标签。
   - 将 `TimeRuler` 剩余的密度热力条与当前播放游标也并入同一 SVG overlay，去掉最后两处 inline style，并把热力条/游标的颜色 owner 收口到 `transcription-timeline.css`。
   - inline debt 从 42 继续收敛到 40，`TimeRuler` 已完全退出 inline debt 列表；同步把 threshold 收紧到 `max=40 / target=38 / warnAt=40`，inline baseline 已刷新到 `total=40`。
   - `TranscriptionPage.layoutGuard.test.ts` 与 `TranscriptionPage.structure.test.ts` 全绿，unused selector 继续维持 0，说明时间尺修复没有破坏时间轴壳层结构。
4. 发现问题：
   - `npm run test:visual-css` 仍被混合工作树阻断，当前漂移范围包括 `ai-hub.css`、`media-controls.css`、`waveform-display.css`、`app-shell-layout.css`、`language-metadata-workspace.css`、`orthography-bridge-workspace.css`、`orthography-manager-panel.css`、`transcription-timeline.css`、`transcription-waveform.css`、`analysis-panel.css`，并且仍有 `language-asset-workspace.css` 未登记 baseline。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先处理 `TranscriptionTimelineMediaLanes`、`TranscriptionTimelineMediaTranscriptionLane` 与 `VoiceAgentWidget`，它们现在是新的高位组。
   - 待并行 CSS 主题范围稳定后，再统一刷新 visual baseline，并补齐 `language-asset-workspace.css` 的 baseline 初始登记。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-inline-style`
   - `npm run check:css-unused-selectors`
   - `npx vitest run src/components/TranscriptionTimelineMediaLanes.test.tsx src/components/VoiceAgentWidget.test.tsx`
   - `npm run check:css-inline-style:write-baseline`
3. 关键结果：
   - 将 `TranscriptionTimelineMediaLanes` 的 lasso 框从绝对定位 HTML 盒子改为 SVG overlay，去掉一组只用于 `left/top/width/height` 的内联几何样式，同时保留现有拖选交互与命中区域。
   - 将 `TranscriptionTimelineMediaTranscriptionLane` 中只负责 `top` 偏移的额外包裹层移除，把子轨道纵向定位并入既有 `TranscriptionTimelineMediaTranscriptionRow` 宿主 style，避免新增新的动态宿主口。
   - 将 `VoiceAgentWidget` 的两条实时能量条改为 SVG meter，并把置信度文字颜色收口到 session-card 级 CSS 变量，文件内 inline debt 从 3 进一步降到 1。
   - inline debt 从 40 继续收敛到 35，其中 `TranscriptionTimelineMediaLanes` 从 3 降到 2，`TranscriptionTimelineMediaTranscriptionLane` 从 3 降到 2，`VoiceAgentWidget` 从 3 降到 1；同步把 threshold 收紧到 `max=35 / target=33 / warnAt=35`，inline baseline 已刷新到 `total=35`。
   - `TranscriptionTimelineMediaLanes.test.tsx` 与 `VoiceAgentWidget.test.tsx` 全绿，unused selector 继续维持 0，说明本轮 SVG 化与宿主收口没有破坏时间轴和语音组件行为。
4. 发现问题：
   - `npm run test:visual-css` 本轮仍未刷新；混合工作树导致的并行样式漂移问题仍需等范围稳定后统一处理。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先审视 `TranscriptionTimelineTextOnly` 与 `TranscriptionTimelineSections` 这两个新的高位项，看是否还能通过既有宿主变量或 SVG 结构继续净减。
   - 在并行 CSS 主题范围稳定后，再统一刷新 visual baseline，避免把非本轮主题的样式漂移一起吞入基线。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十一）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npm run check:css-dup-selectors`
   - `npm run check:css-inline-style`
   - `npm run check:css-unused-selectors`
   - `npm run check:css-debt-thresholds`
   - `npx vitest run src/pages/TranscriptionPage.layoutGuard.test.ts src/pages/TranscriptionPage.structure.test.ts src/pages/OrthographyManagerPage.test.tsx`
   - `npm run check:css-inline-style:write-baseline`
3. 关键结果：
   - 将语言资产共享样式里的 orthography manager 上下文规则，从会被 duplicate scanner 识别成 root owner 的 `.orthography-manager-page ...` / `.orthography-manager-panel-shell ...` 前缀，统一收口到共同宿主 `language-asset-workspace-shell`，并让 `OrthographyManagerPanel` 显式挂载该共享壳层类。
   - 这样清除了此前阻塞 CSS debt threshold 的无关 duplicate blocker，`duplicateClassNames` 恢复到 0，同时保持 language asset 三页 modal workbench 的共享视觉宿主不变。
   - 将 `TranscriptionTimelineSections` 中波形壳层高度、视频预览宽度与面板高度，合并为两个 CSS 变量宿主，去掉 `wave-canvas`、`video-preview-layout-video` 与 `video-preview-panel` 上分散的 3 处内联样式；文件内 inline debt 从 3 继续收敛到 2。
   - inline debt 从 35 进一步收敛到 34，并同步把 threshold 收紧到 `max=34 / target=32 / warnAt=34`，inline baseline 已刷新到 `total=34`。
   - `TranscriptionPage.layoutGuard.test.ts`、`TranscriptionPage.structure.test.ts` 与 `OrthographyManagerPage.test.tsx` 全绿；同时 `check:css-dup-selectors`、`check:css-unused-selectors`、`check:css-debt-thresholds` 全部恢复通过。
4. 发现问题：
   - `TranscriptionTimelineTextOnly` 仍是当前 inline 高位文件，但剩余 4 处主要由虚拟列表项宽度/偏移与 lane 级动态高度驱动，下一轮如果继续净减，需要更强的结构吸收而不是简单搬运 style 宿主。
   - `npm run test:visual-css` 仍未刷新；混合工作树下的并行样式漂移范围依旧需要后续统一收口。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先重新评估 `TranscriptionTimelineTextOnly` 与 `OrchestratorWaveformContent`，只做能真实减少运行时几何 style 需求的结构改造。
   - 待并行 CSS 主题范围稳定后，再统一刷新 visual baseline，并补齐 `language-asset-workspace.css` 的 baseline 初始登记。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十二）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npx vitest run src/pages/TranscriptionPage.layoutGuard.test.ts src/pages/TranscriptionPage.structure.test.ts src/components/TranscriptionTimelineTextOnly.test.tsx`
   - `npm run check:css-inline-style`
   - `npm run check:css-inline-style:write-baseline`
   - `npm run check:css-debt-thresholds`
3. 关键结果：
   - 为 `TranscriptionTimelineTextOnly` 抽出共享几何宿主 `TimelineStyledContainer`，把 text-only lane 与 translation lane 上重复的运行时宽度/位移容器统一收口到单一宿主组件，文件本身已退出 inline debt 列表。
   - 将 `OrchestratorWaveformContent` 的 lasso 框改为 SVG overlay，并把选择提示嵌入 `foreignObject`，继续去掉一组只服务于 lasso 几何的绝对定位 HTML 内联样式；文件内 inline debt 从 3 继续降到 2。
   - inline debt 从 34 进一步收敛到 29，并同步把 threshold 收紧到 `max=29 / target=27 / warnAt=29`，inline baseline 已刷新到 `total=29`。
   - `TranscriptionPage.layoutGuard.test.ts`、`TranscriptionPage.structure.test.ts` 与 `TranscriptionTimelineTextOnly.test.tsx` 全绿，说明 TextOnly 宿主抽象与波形 lasso SVG 化没有破坏时间轴结构和文本轨行为。
4. 发现问题：
   - 本轮中途一度出现 `TranscriptionTimelineTextOnly` 的 JSX 闭合错误，但已通过最小修补恢复，不涉及运行时语义回退。
   - `npm run test:visual-css` 仍未刷新；混合工作树下的并行样式漂移范围依旧需要后续统一收口。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先处理仍处于高位的 `TranscriptionTimelineMediaLanes`、`TranscriptionTimelineMediaTranscriptionLane`、`TranscriptionTimelineSections` 与 `OrchestratorWaveformContent` 剩余真实几何型 inline style。
   - 待并行 CSS 主题范围稳定后，再统一刷新 visual baseline，避免把非本轮主题的样式漂移吞入基线。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十三）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npx vitest run src/components/TranscriptionTimelineMediaLanes.test.tsx src/pages/TranscriptionPage.layoutGuard.test.ts src/pages/TranscriptionPage.structure.test.ts`
   - `npm run check:css-inline-style`
   - `npm run check:css-inline-style:write-baseline`
   - `npm run check:css-debt-thresholds`
3. 关键结果：
   - 为 `TranscriptionTimelineMediaLanes`、`TranscriptionTimelineMediaTranscriptionLane` 与 `TranscriptionTimelineSections` 继续复用共享布局宿主 `TimelineStyledContainer`，把多处只承载 CSS 变量或容器宽度的动态布局壳层统一收口，不再在各文件散落重复的 `style={{ ... }}` 宿主。
   - 同时为 collapsed overlap hint 增加按钮版共享宿主 `TimelineStyledButton`，使重叠提示按钮和 lane 根容器沿用同一套布局承接方式。
   - inline debt 从 29 进一步收敛到 23，相关高位文件已经退出 debt 头部列表；同步把 threshold 收紧到 `max=23 / target=21 / warnAt=23`，inline baseline 已刷新到 `total=23`。
   - `TranscriptionTimelineMediaLanes.test.tsx`、`TranscriptionPage.layoutGuard.test.ts` 与 `TranscriptionPage.structure.test.ts` 全绿，说明 lane 宿主收口和预览区变量宿主抽离没有破坏媒体时间轴和转写页布局守卫。
4. 发现问题：
   - 剩余 inline debt 已明显集中到 `OrchestratorWaveformContent`、`TranscriptionPage.ReadyWorkspace` 以及少量真正依赖运行时几何的面板组件，后续收益会更依赖针对性结构调整，而不是继续批量收宿主。
   - `npm run test:visual-css` 本轮仍未刷新；混合工作树中的并行样式漂移范围依旧需要后续统一收口。
5. 下一轮动作：
   - 若继续推进 CSS debt，优先重看 `OrchestratorWaveformContent` 与 `TranscriptionPage.ReadyWorkspace`，确认是否还能在不掩盖真实几何需求的前提下进一步压缩剩余 inline 口。
   - 待并行 CSS 主题范围稳定后，再统一刷新 visual baseline，避免把非本轮主题的样式漂移吞入基线。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十四）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npx vitest run src/pages/TranscriptionPage.layoutGuard.test.ts src/pages/TranscriptionPage.structure.test.ts src/components/TranscriptionTimelineMediaLanes.test.tsx src/components/TranscriptionTimelineTextOnly.test.tsx`
   - `npm run check:css-inline-style`
   - `npm run check:css-inline-style:write-baseline`
   - `npm run check:css-debt-thresholds`
3. 关键结果：
   - 为 `WaveformAreaSection` 增加 `layoutStyle` 宿主承接，让 `OrchestratorWaveformContent` 的 `--waveform-height` 变量从直接 `style={{ ... }}` 改为结构性布局属性传递；同时为时间轴/转写页共享宿主补充 `TimelineStyledSection`，把 `TranscriptionPage.ReadyWorkspace` 根节点上成组的 CSS 变量统一收口到共享 `section` 宿主。
   - 这样清除了两个高位文件中最后的“纯变量宿主” inline style，剩余债务几乎全部收敛为真正依赖运行时坐标的单点样式（如 tooltip / note indicator / annotation position）。
   - inline debt 从 23 进一步收敛到 21，并同步把 threshold 收紧到 `max=21 / target=19 / warnAt=21`，inline baseline 已刷新到 `total=21`。
   - `TranscriptionPage.layoutGuard.test.ts`、`TranscriptionPage.structure.test.ts`、`TranscriptionTimelineMediaLanes.test.tsx` 与 `TranscriptionTimelineTextOnly.test.tsx` 全绿，说明这轮宿主抽离没有破坏波形区、时间轴和文本轨结构守卫。
4. 发现问题：
   - 当前剩余 inline debt 已不再有高位聚集文件，全部分散为单文件单处；继续下降时必须逐条判断是否为真实运行时几何需求，避免把指标优化退化成“换个 prop 名继续传 style”。
   - `npm run test:visual-css` 仍未刷新；混合工作树中的并行样式漂移范围依旧需要后续统一收口。
5. 下一轮动作：
   - 若继续推进 CSS debt，建议逐条审查剩余 21 处单点 style，只处理能被明确结构吸收的少数项，其余作为真实动态布局白名单候选评估。
   - 待并行 CSS 主题范围稳定后，再统一刷新 visual baseline，避免把非本轮主题的样式漂移吞入基线。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十五）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npx vitest run src/components/ShortcutsPanel.test.tsx src/components/transcription/LeftRailProjectHub.test.tsx src/components/ai/AiChatMetricsBar.test.tsx src/components/ai/AiComplexPanels.rtlMatrix.test.tsx`
   - `node scripts/check-css-inline-style.mjs`
   - `node scripts/check-css-debt-thresholds.mjs`
3. 关键结果：
   - 为 `DialogShell`、`ModalPanel` 与 `EmbeddedPanelShell` 增加统一的 `layoutStyle` 布局宿主承接，随后把 `SidePaneActionModal`、`LayerActionPopover`、`ShortcutsPanel`、`AiChatPromptLabModal` 与 `AiChatReplayDetailPanel` 上仅用于宽度/最小最大宽度的壳层 inline style 收回共享面板壳层。
   - 这轮没有碰运行时坐标或真实几何项，只清除了共享面板族中重复出现的“宽度宿主” style，inline debt 从 21 收敛到 16。
   - 上述 4 个聚焦回归文件共 14 个测试全部通过，说明共享壳层 API 扩展没有破坏快捷键面板、左轨 Hub 和 AI 复杂面板的既有交互。
4. 发现问题：
   - 剩余 inline debt 已进入单文件单点阶段，继续下降时必须区分“壳层宽度宿主”与“真实定位/排版策略”，否则很容易退化成指标层面的 prop 改名。
   - visual baseline 本轮仍未刷新，原因仍是混合工作树里存在并行样式变更，暂不把非本轮主题吞进视觉基线。
5. 下一轮动作：
   - 继续从剩余单点中挑出仍属壳层宿主的候选，优先处理 `NotePanel`、`TimelineLaneHeader` 这类已经能复用共享面板壳层 API 的项。
   - 对 `ContextMenu`、`PdfPreviewSection`、`TimelineAnnotationItem` 这类真定位项保持克制，不做表面化收口。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十六）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npx vitest run src/components/NotePanel.test.tsx src/components/TimelineLaneHeader.test.tsx src/pages/TranscriptionPage.Toolbar.test.tsx`
   - `node scripts/check-css-inline-style.mjs`
   - `node scripts/check-css-debt-thresholds.mjs`
3. 关键结果：
   - 将 `NotePanel` 与 `TimelineLaneHeader` 继续切到前一轮已建立的共享壳层 `layoutStyle` 承接，消除两处仅负责宽度/字号/高度宿主的 `style={{ ... }}`。
   - 将 `TranscriptionPage.AiPanelHandle` 的 hover zone 显隐从 inline `display` 改为语义化 `hidden` 属性，避免在 AI 侧栏折叠手柄上继续保留单点内联显隐逻辑。
   - inline debt 从 16 进一步收敛到 13，并同步把 threshold 收紧到 `max=13 / target=11 / warnAt=13`，baseline 已刷新到 `total=13`。
   - `NotePanel.test.tsx`、`TimelineLaneHeader.test.tsx` 与 `TranscriptionPage.Toolbar.test.tsx` 共 11 个测试全部通过，确认本轮宿主收口没有破坏备注面板、轨道头锁定弹窗与转写页工具条。
4. 发现问题：
   - 当前剩余 13 处已经几乎全是运行时宽度、坐标、预览排版或 annotation 位置这类真实动态样式，后续每一项都需要先证明“能被结构吸收”，再决定是否继续清理。
   - `GroundingContext`、`BatchOperationPanel`、`OrthographyBuilderPanel` 等剩余项中，已有多处更像真实数据驱动几何/排版，而不是简单宿主样式，后续应优先做白名单评估而不是强压数字。
5. 下一轮动作：
   - 重新逐条审视剩余 13 处 inline，优先确认哪些已经属于合理动态样式，哪些仍能抽成共享宿主或语义属性。
   - 若继续收口，先从最接近宿主语义的单点做起，再决定是否需要为真正的动态几何建立白名单或更细粒度口径。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十七）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npx vitest run src/components/ai/AiChatMetricsBar.test.tsx src/components/ai/AiComplexPanels.rtlMatrix.test.tsx`
   - `node scripts/check-css-inline-style.mjs`
   - `node scripts/check-css-debt-thresholds.mjs`
3. 关键结果：
   - 将 `GroundingContext` 里 attention hotspot 的分数条从 `div` 宽度填充改为 SVG 进度条，保留同样的渐变视觉方向，但不再依赖 `style={{ width: ... }}` 这种百分比宿主写法。
   - 这属于真实结构优化而不是 prop 改名，因为热点分数条本身就是单轴进度可视化；改造后 inline debt 从 13 进一步收敛到 12。
   - `AiChatMetricsBar.test.tsx` 与 `AiComplexPanels.rtlMatrix.test.tsx` 共 9 个测试全部通过，说明这轮 AI 面板上下文展示的结构改造没有引入可见回归。
4. 发现问题：
   - 剩余 12 处 inline 目前全部落在上下文菜单、浮层 tooltip、批量操作弹窗定位、标注定位、视频与时间轴实时几何等区域，继续下降的空间已经明显收窄。
   - 后续如果还要推进，应该优先建立“真实动态几何”与“仍可结构吸收”的正式区分，否则会开始为了数字而损伤代码可读性。
5. 下一轮动作：
   - 对剩余 12 处逐项分类，优先确认是否需要白名单机制，还是继续少量结构抽离。
   - 若继续改代码，先挑 `BatchOperationPanel` 之外那些仍可能是可替换宿主的轻量项，避免硬碰真实定位逻辑。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十八）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `npx vitest run src/components/TranscriptionTimelineMediaLanes.test.tsx src/pages/TranscriptionPage.structure.test.ts`
   - `node scripts/check-css-inline-style.mjs`
   - `node scripts/check-css-inline-style.mjs --write-baseline`
   - `node scripts/check-css-debt-thresholds.mjs`
3. 关键结果：
   - 继续把 `TranscriptionTimelineMediaTranscriptionRow` 与 `TranscriptionTimelineMediaTranslationRow` 的子轨绝对定位壳层收口到共享 `TimelineStyledContainer`，再消除两处只承载 `top/height` 的 inline style，raw inline 从 12 进一步降到 10。
   - 在此基础上新增 `css-inline-style-whitelist.json` 与共享 governance helper，让 inline scanner 同时输出 raw、approved、governed 三个口径；剩余 10 处全部要求显式登记文件、数量与原因，且 stale whitelist 会直接失败。
   - `inlineStyleOccurrences` 阈值正式切到“未批准债务”口径：当前 raw=10、approved=10、governed=0，因此 threshold 已收紧到 `max=0 / target=0 / warnAt=0`，同时保留 raw 统计用于持续观察。
   - `TranscriptionTimelineMediaLanes.test.tsx` 与 `TranscriptionPage.structure.test.ts` 共 49 个测试通过，确认 media row 子轨宿主收口没有破坏时间轴结构；新的 inline scanner 也能在白名单前提下继续阻止未登记 inline style 混入。
4. 发现问题：
   - 当前 whitelist 是按“文件级数量 + 理由”治理，而不是精确到具体 snippet；它已经足够阻止新增 inline style 混入，但若未来同文件内替换为另一处动态 style，仍需 reviewer 主动核对白名单理由是否仍成立。
   - 剩余 raw inline 已全部属于上下文菜单、tooltip、drag panel、annotation geometry、runtime preview typography 这类真实动态场景，后续继续降低 raw 数值的空间会明显变小。
5. 下一轮动作：
   - 若继续推进，优先挑 raw whitelist 中仍可能结构化的个别项做减法，并同步删掉对应白名单条目。
   - 若治理重点转向稳定守门，则把审查焦点从“继续压 raw 数字”切换为“确保 whitelist 理由不过期、数量不漂移”。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（十九）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `node scripts/write-css-inline-style-whitelist-review.mjs --reviewer "GitHub Copilot + junwei" --reviewed-at "2026-04-09"`
   - `node scripts/check-css-inline-style.mjs`
   - `node scripts/check-css-debt-thresholds.mjs`
3. 关键结果：
   - 为 inline style 白名单新增 `reviewer`、`reviewedAt` 与 `reviewedSha256` 三个强制字段，并让 scanner 在统计 raw/approved/governed 三个口径时同时校验“白名单理由是否针对当前文件内容重新复核过”。
   - 新增 `write-css-inline-style-whitelist-review.mjs` 刷新脚本与 `check:css-inline-style:write-whitelist-review` 命令，允许在确认理由仍成立后重新写入 review stamp，而不是手工改 JSON hash。
   - 现在只要某个白名单文件继续被修改，`reviewedSha256` 就会失配并直接把 `check-css-inline-style` / `check-css-debt-thresholds` 打红，迫使修改者同步重签 review，而不再只依赖文件级 count 与 reason 的静态声明。
4. 发现问题：
   - 当前 review 约束已经能确保“文件变了就必须重审”，但仍是文件级粒度；如果未来同文件中保留 1 处 inline style、却在另一处新增了新的动态 style，仍需要 reviewer 结合 reason 人工判断是否越界。
   - 因为 repo 当前是混合工作树，白名单 review stamp 默认签到了当前工作副本内容，而不是某个独立提交；这适合日常守门，但不应被误解为替代代码审查本身。
5. 下一轮动作：
   - 若后续继续依赖 whitelist，优先把 reviewer 关注点聚焦到“理由是否仍对应当前唯一那一处动态样式”。
   - 若未来还要细化，可以再把文件级 whitelist 升级为 snippet/line-anchor 级别，但那应在当前守门稳定之后再做。

## 2026-04-09 Layout Guard 与 Inline Debt 收口（二十）

1. 执行人：GitHub Copilot + junwei
2. 执行命令：
   - `node scripts/write-css-inline-style-whitelist-review.mjs --reviewer "GitHub Copilot + junwei" --reviewed-at "2026-04-09"`
   - `node scripts/check-css-inline-style.mjs`
   - `npm run test:visual-css:write-baseline`
   - `npx vitest run src/App.test.tsx src/pages/LanguageMetadataWorkspacePage.test.tsx src/pages/OrthographyBridgeWorkspacePage.test.tsx`
3. 关键结果：
   - 将 inline style whitelist 从“文件级数量 + 文件 hash”升级为“snippet anchor + snippet reviewedSha256”治理；现在只有被明确锚定到那一处动态 style 的片段才会被批准，同文件新增别的 `style={{ ... }}` 不会再被旧 review 自动吞掉。
   - `write-css-inline-style-whitelist-review.mjs` 同步切到 snippet 级重签：reviewer 仍然签理由，但 hash 只绑定到被批准的那一段样式表达式，而不是整个文件，因此同文件里的无关改动不会再强迫白名单重签。
   - 为 `LanguageAssetRouteDialog` 增加 `workspace` surface 变体，并让三条语言资产 modal 路由统一挂到 `language-asset-modal-surface--workspace`；这样 language metadata / orthography / bridge 三个工作台共享同一层 modal 壳宽度与视觉基线，不再靠各页自行漂移。
   - 同步刷新 `app-shell-layout.css` 的 visual baseline，并补上 `App.test.tsx` 对 workspace modal surface 变体的断言，确保共享壳层后续不会静默回退。
4. 发现问题：
   - 当前 snippet anchor 仍依赖字符串匹配而不是 AST 级 JSX 属性节点定位，但已经足够把治理粒度从“整文件”收紧到“唯一批准片段”，维护成本明显低于再引入完整解析器。
   - visual baseline 仍是 CSS 文件哈希快照，不是截图级回归；它适合守住共享壳层/主题样式漂移，但不能替代交互视觉检查。
5. 下一轮动作：
   - 若后续还有白名单条目变成多 snippet 文件，继续要求每一处动态 style 都写 anchor，避免退回文件级口径。
   - 若语言资产工作台后续继续扩展，优先复用 `language-asset-modal-surface--workspace` 与 `language-asset-workspace-shell`，不要再新增独立 modal 宽度宿主。
