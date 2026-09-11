---
title: annotation-m1-open design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-11
source_of_truth: annotation-m1-open-spec
depends_on:
  - ./requirements.md
  - ../annotation-morpheme-edit/design.md
  - ../../plans/标注页与词典页开发路线图-2026-04-25.md
---

# Design — Annotation M1 Open (B4c / B4d / B4e)

## 1. 成熟方案扫描 / Research

- 仓库既有：键盘 `playToggle`（`annotationKeyboardMachine`）；转写条 `TimelineTranslationAudioControls` 用 `HTMLAudioElement` + `readAudioBlobFromDetails`；备注 `useNotes` → Dexie `user_notes`；selfCertainty 经 `LinguisticService.units.saveBatch`；AutoGloss exact/stem/substring 写库。`WaveSurfer` 只在转写 Orchestrator。
- 同类产品：ELAN/Praat 按段 seek+play；FLEx Interlinear 在格子里改 note/certainty，不把媒体波形嵌进每一行；Plaid Analyze 用受控 IGT，建议 gloss 需确认。
- 业内：Web 段播放用原生 `HTMLMediaElement` 的 `currentTime` + `timeupdate` 停在 end；W3C HTML media；Leipzig gloss 仍非阻断。WebVTT/字幕播放器也是 range clip，不挂全量波形。
- 公认不可行：复制 Orchestrator / ChatWindow；用 `AutoGlossService.glossUnit` 做 preview（立即写库）；为 tag 新建表；把 note 写进 `layer_units.notes` 造成第二真源；行内 wavesurfer 微波形（M1 路线图曾写，侵入面过大且与「禁止复制转写波形桥」冲突）。
- 潜在的坑：jsdom `HTMLAudioElement.play` 常拒绝；无 blob/url 要 skipped 而非 throw；`saveUnitsBatch` 必须带完整 unit，只改 `selfCertainty`；`updateTokenGloss` 一次一语言键；脏草稿覆盖会丢用户输入。
- 决定：**复用** LinguisticService media/units/tokens、`user_notes`、既有匹配函数；**适配** 把 AutoGloss 匹配抽成只读 `previewAutoGlossMatches`；**自研** 最小 range toggle 与三个 annotation controller。不新增依赖。

## 2. 架构选择

- 落位：`actions`（播放/写库）+ `state`（备注草稿、preview）+ `derived`（行时间范围）
- 选 A：三个 sibling controller + 纯函数；workspace 只 return `onKeyDown` 的 action 供壳层接线
- 拒绝：把播放塞进已满的 workspace；挂转写 waveform bridge；preview 走 TaskRunner 写路径

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `playAnnotationUnitRange.ts` | range resolve / toggle / stop-at-end | < 80 |
| `useAnnotationSegmentPlaybackController.ts` | 加载 blob/url、Space 接线 | < 160 / ≤ 8 hooks |
| `saveAnnotationUnitMeta.ts` | note + selfCertainty 写+readback | < 140 |
| `useAnnotationUnitMetaController.ts` | 备注/标签/确信度 UI 状态 | < 200 / ≤ 12 |
| `autoGlossPreview.ts` + `applyAnnotationAutoGloss.ts` | 只读匹配；确认写入 | < 180 + < 100 |
| `useAnnotationAutoGlossController.ts` | preview/apply | < 160 |

约束自查：无 ChatWindow；无 `src/features/`；原生 input 边框不计入容器层。

## 4. ADR 引用

- ADR-0020 读范围不变；备注真源 `user_notes`；selfCertainty 仍在 `layer_units` 该行
- 新建 ADR：否

## 5. Feature flag

- Flag 名：`annotationPageEnabled` / `VITE_ANNOTATION_PAGE_ENABLED`
- 默认值：`true`（本切片目标即开放标注页；env=`false` 保留占位面板与 layout guard）
- Rollout：合并即对内开放；语料 flag 仍 false

## 6. 失败模式 / 兼容性

- 无媒体 / 无时间范围：`skipped`，键盘 action 仍记录 `playToggle`
- 无匹配：preview 空列表，不写库
- 回滚：env 关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元 | annotation helpers + `AnnotationPage.test.tsx` + AutoGloss | pass |
| 守卫 | architecture-guard / docs / workflow / r1-r8 | OK |
| E2E | `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts` | `/annotation` 工作台可见 |
