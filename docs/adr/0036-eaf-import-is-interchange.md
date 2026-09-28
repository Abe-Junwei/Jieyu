---
title: ADR 0036 - EAF 导入是文本交换，不是整库备份
doc_type: adr
status: active
owner: transcription
last_reviewed: 2026-09-28
source_of_truth: decision
---

# ADR 0036 — EAF 导入是文本交换，不是整库备份

## 背景

`importFromEaf` 读的是 ELAN 正文：媒体文件名、`LANGUAGE` 显示名、`LINGUISTIC_TYPE`、`TIME_SLOT`、层、`ANNOTATION_REF`，以及解语自己写入的两类 `HEADER/PROPERTY`（`jieyu:project-meta:timeline`、`jieyu:layer-meta:{tierId}`）。头部这两项只带回正字法和逻辑时长。时间在 `TIME_ORDER`，父子在 `PARENT_REF` 和 `ANNOTATION_REF`。

同一文件再导入时，写入路径总是 `newId('utt')`，标注 id 只抄进 `externalRef`。第一条独立时间对齐层独占转写，其余独立层进附加层。词注释和语素注释的语言写死 `eng`。笔记和译文用 ±50ms 对时间。当前时间轴没有媒体、且文件名不是 `unknown.wav` 时，会建一条时长为 0 的空音频。`HEADER@TIME_UNITS` 导出写成 `milliseconds`，导入不读。

整库原 id 备份是 `.jyt`（快照去掉音频字节）和 `.jym`（快照带媒体）。没有 `.jy`。

[flibl](https://github.com/amaliaskilton/flibl) 用一份层角色表，把原始 ELAN 标注 id 放在不被随手改写的字段里做往返键，说话人用参与者代码，目标模型装不下的结构记在父标注上。它依赖手改 JSON 和 Python，并且往返时必须留着原 EAF。解语两端都自己写，不照搬这条工作流。

## 决策

1. EAF 保持为文本交换投影。`.jyt` / `.jym` 继续保存原 id 和媒体字节。不把 EAF 做成第二套库。
2. 往返连接键是「当前文稿 + 外部层 id + 标注 id」，落在已有 `externalRef`。对上则更新该条，对不上才新建。标注 id 不是全局主键。用户改的是转写正文，不是这个字段。
3. 没有层角色表时，保持今天的行为：第一条独立时间对齐层当转写，其余进附加层。有表时，角色为转写的每条独立层各自成转写层。解语导出自己写这张表。外来文件第一次导入时选一次，记在现有文稿元数据里。不新增 Dexie 版本，不引入手写配置文件。
4. 时间读 `HEADER@TIME_UNITS`。缺省或无法识别时按毫秒，并留下诊断。只认 ELAN 枚举：`milliseconds`、`NTSC-frames`、`PAL-frames`、`PAL-50-frames`。`PAL-frames` 按 25 帧/秒，`PAL-50-frames` 按 50 帧/秒，`NTSC-frames` 按 30000/1001 帧/秒。
5. 笔记和译文先按 `ANNOTATION_REF` 挂到父标注。没有引用时才用 ±50ms。
6. 词注释和语素注释的语言取该层 `LANG_REF`，其次 `DEFAULT_LOCALE`。不写死 `eng`。
7. 媒体按文件名挂到本文稿已有媒体。对不上就不建 0 时长空音频。音频字节仍只进 `.jym`。
8. 外来 EAF 的词条仍按词形匹配或创建。只有解语导出在标注上写了词条 id，链接才按原 id 往返。
9. 受控词表、说话人方言、受话人记在父标注的类型化注释上。不升成新表，也不静默丢掉。
10. 已有 `Symbolic_Subdivision` 词层时，用该层做词切分。不用字符类正则当主切分。不把依赖层收窄成只认 `Symbolic_Association`。

## 影响

- 解析仍在 `src/services/EafService.ts` 的 `importFromEaf`。新规则做成旁边的纯函数，不把 `useImportExport.importHandlers.ts` 再堆长。
- 无角色表的外来文件，层的归类与现在相同。再导入、非毫秒时间单位、空音频这三条会改变已有结果，按执行计划的切片分别用测试锁住。
- 层角色选择若只是现有导入流程里的一次确认，不新增 feature flag，也不单开 SDD。一旦为此新增 controller，先写 `docs/execution/specs/eaf-import-alignment/`。

切片、验证和非目标见 [EAF 导入对齐改进](../execution/plans/EAF导入对齐改进-2026-09-28.md)。

## 不采纳

- 把 flibl 收成依赖，或要求往返时旁边留着原 EAF。
- 儿童语料里的 target-utterance，以及把儿童和成人拆成两种语言。
- 用 AFL++ 或 GitHub Taskflow 扫 EAF。导入可靠性已经用 fast-check 锁在解析器上。
- 从外来 EAF 恢复层 id、语段 id、词条 id、`layer_links`。这些只在 `.jyt` / `.jym` 里。

## 回顾

层角色若放不进现有文稿元数据，先另写 ADR，再谈 Dexie 版本。本决策不改 ADR 0009：`timelineMode` 仍只是互操作标签，坐标仍是 `startTime` / `endTime`。
