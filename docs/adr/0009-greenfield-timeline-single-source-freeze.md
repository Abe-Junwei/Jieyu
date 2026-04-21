---
title: ADR-0009 绿场时间轴单一真相冻结（Superseding）
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-21
source_of_truth: decision-record
---

# ADR-0009 绿场时间轴单一真相冻结（Superseding）

## Status

Accepted（Greenfield 一次切流基准；后续若变更需新增 superseding ADR）。

## Supersedes

- Supersedes ADR-0004 的运行时分叉语义：
  - `timelineMode` 参与 UI 壳选择与状态提示的路径。
  - 以 `timelineMode` 推导 placeholder 行为的路径。
- 保留 ADR-0004 的互操作目标：导入导出可携带时间基与映射信息。

## Context

当前实现在三处耦合较重：

1. 运行时 UI 壳（waveform/text-only/empty）与 `timelineMode`、媒体可播状态交织。
2. 业务写入与 cleanup 路径中，`timelineMode` 同时承担“运行态开关 + 互操作标签”双重职责。
3. 导入导出、状态条文案、placeholder 判定共享同一字段，导致语义边界不清。

Greenfield 目标是：单一时间轴宿主 + 可选声学插件，减少双轨路径与隐式门控。

## 决策

### 决策 1：主存坐标单一真相

- `layer_units` 与 segment 的 `startTime/endTime` 是唯一 canonical 坐标。
- 坐标解释不依赖 `timelineMode`，只依赖当前 read model 与 timeMapping 规则。

### 决策 2：声学是可选插件，不是壳层分支

- 运行时仅使用 `AcousticSnapshot`（`no_media` / `pending_decode` / `playable`）驱动声学能力展示。
- 无可播媒体时，时间轴编辑能力保持可用；仅声学相关能力降级。

### 决策 3：timeMapping 是时间换算唯一规则

- 当存在映射时使用：`realTime = offsetSec + scale * documentTime`（`scale > 0`）。
- 无映射时等价 `scale = 1` 且 `offsetSec = 0`。
- 所有“文献时间 <-> 播放器时间”换算必须显式走映射函数，不允许散落线性特判。

### 决策 4：`timelineMode` 降级为导出标签，不再驱动运行时

- `timelineMode` 不再参与：
  - UI 壳选择；
  - placeholder 判定；
  - 轴状态条逻辑分支。
- `timelineMode` 仅用于导出互操作标签（例如 EAF/Flex/TextGrid/TRS/Toolbox）。

### 决策 5：导出字段冻结

- 运行时内部：
  - 必须持有 `logicalDurationSec`（逻辑轴长度）与可选 `timeMapping`。
- 交换格式输出：
  - `timelineMode`（导出标签，非运行态开关）；
  - `logicalDurationSec`；
  - `timeMapping`（如目标格式支持）；
  - `timebaseLabel`（如目标格式支持）。

### 决策 6：迁移顺序冻结

1. 先收口 placeholder 与 axis/status（低风险 UI 面）。
2. 再收口 read/write/cleanup（运行态去 mode 化）。
3. 最后收口 import/export 标签来源（从运行态改为导出上下文）。

## Consequences

- `timelineMode` 相关测试从“运行态行为断言”转为“导出标签断言”。
- `mediaItemTimelineKind` 与 project media setup 需改为显式 placeholder 字段断言。
- 纵向/横向 projection 只消费统一 read model，不再借道 text-only 壳语义。

## Verification

- `timelineShellMode.test.ts`：不再出现 `timelineMode` 决定壳层的断言。
- `timelineAxisStatus.test.ts` 与 `TimelineAxisStatusStrip.test.tsx`：只按 `AcousticSnapshot` 三态断言。
- `LinguisticService.test.ts`：无 `timelineMode` 运行态门控时，删音/导音后仍保持主存坐标与可编辑性。
- 导入导出服务测试：保留 `timelineMetadata` roundtrip，但来源为导出上下文而非运行态开关。

## Non-goals

- 本 ADR 不定义 UI 视觉样式细节。
- 本 ADR 不要求保留旧工程自动迁移脚本（Greenfield 默认不兼容旧库）。

## References

- docs/adr/0004-logical-timeline-acoustic-media-lifecycle.md
- docs/execution/plans/模式架构与平级评估-2026-04-21.md
