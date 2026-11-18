---
title: ADR 0122 - 整数毫秒、文稿可以不挂录音
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-18
source_of_truth: decision-record
depends_on:
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0088-desktop-sqlite-domain-landings.md
  - ./0094-transcription-run-acceptance-facts.md
  - ./0100-desktop-engineering-contract.md
  - ./0121-text-save-receipt-and-draft.md
---

# ADR 0122：整数毫秒、文稿可以不挂录音

## 背景

ADR-0100 E06 要求句段和点的内部时间是整数毫秒，开始早于结束。现行 `user_version` 28 把句段时间存成 `REAL` 秒，并且允许零长。桌面项目库还要求每份文稿必须挂一条录音，没有「只有文本、仍要在时间轴上排序、缩放、拆分、合并」的做法。`logical_duration_sec` 和 `time_mapping_json` 是旧浏览器版逻辑秒和文稿轴映射留下的。

2026-11-18 用户确认：古代文献这类只有文本的材料不编造时间；挂上录音之后允许一部分句段先对齐、一部分以后再补。

## 调研

ELAN 的时间槽是整数毫秒，允许没有时间值的时间槽，点层独立。Praat 普通拖动只改一条边界。FLEx 文本和 Toolbox 只有顺序、没有时间。旧浏览器版用 `'document'` 时间轴和逻辑秒假装有时间；假时间会进 EAF／TextGrid、检索和统计，以后挂上真录音还得作废。E06 和 EF-018 都不允许编造时间。

映射换算在 `src/services/LinguisticService.timeMapping.ts`，旧页面和桌面共用。把它改成毫秒要分叉或连旧页面一起改。录音时长来自解码器，本来就是秒。

## 决定

1. **开发格式改为 `user_version` 29，不写迁移器。** 不是 29 的 `project.sqlite` 仍以「不是解语项目库」拒绝，文件字节保持原样。受控合成项目删文件夹后重开。代码现为 29。
2. **用户编辑的时间一律整数毫秒，并且改名。** `units` 的 `start_time`／`end_time` 改为可空的 `start_ms`／`end_ms`。点的时刻是 `time_ms`。`model_runs` 的 `range_start`／`range_end` 改为 `range_start_ms`／`range_end_ms`。桌面操作契约用同名的 `startMs`、`endMs`、`rangeStartMs`、`rangeEndMs`。漏改的调用处由类型检查报出。
3. **秒只留在边界。** 播放器、波形组件、EAF／TextGrid 导入导出经 `src/db/desktop/timeMs.ts` 换算。恰为半毫秒时向时间轴正方向取整。`media.duration` 保持秒。查媒体范围时把句段毫秒换回秒再比。
4. **删掉 `logical_duration_sec`、`time_mapping_json` 和 `time_mapping_history_json`。** 挂了录音的句段直接存录音上的毫秒。换录音要整体平移或伸缩时，做成一次性的「整体调时」：改写受影响句段的毫秒，同一步可撤销。不保留一份会让句段时间和录音时间变成两个数的映射。
5. **文稿可以不挂录音。** `manuscripts.media_id` 改为可空。`units` 增加 `sort_order`，排序只看它。时间约束是：开始和结束都为空，或者开始早于结束。库不接受零长。
6. **允许部分对齐。** 同一层里可以有的句段有时间、有的没有。有时间的句段，时间先后必须和 `sort_order` 一致，由写入路径检查。没时间的句段在时间轴上夹在前后已对齐段之间，按字数排开。
7. **点必须有时刻。** 点层独立成表，同层同一毫秒唯一。没挂录音的文稿不能新建点层。解除录音关联时，句段时间和已有点的时刻都原样保留，只是不再做媒体范围检查；不要求先删点层。
8. **合并一段有时间、一段没有的相邻句段，结果没有时间。** 确认框说明丢掉的是哪一段的时间，同一步可撤销。不编造另一端的时间。
9. **最短长度分两处。** 库只要求开始早于结束（至少 1 毫秒）。界面上拖动和拆分用 10 毫秒下限，和一次方向键微调相同。导入短于 10 毫秒的段不拒绝。
10. **拆分和合并产生新身份，并留下旧到新的映射。** 映射表只存操作、旧 id、新 id 和种类（拆分或合并）。旧 id 不设外键，因为旧行会删掉。具体列随 1b-0 的实现 PR 定稿。
11. **界面另片。** 表结构在 1b-0 一次改完。无录音文稿的排版、只按文字位置拆分、逐段补时间，另开 1b-7，排在 1b-6 之后，仍属第一程。
12. **与旧决定冲突时以本篇为准。** 下列句子不再执行。被点名的 ADR 正文不改，整篇也不改成 superseded。E06 的其余句子（整数毫秒、恰半毫秒向时间轴正方向取整、播放器秒制只在边界转换、同层不重叠、开始早于结束、默认单边、拆合新身份）仍然有效。`export_timeline_mode` 和 `tier_roles_json` 仍按 ADR-0088，本篇不删。

    - ADR-0100 对照表里「文献轴与媒体轴映射保留」。
    - ADR-0100 E06「既有文献轴／媒体映射不取消」。
    - ADR-0100 E06「文献轴按映射核对媒体范围，不能直接将文献时码与录音秒数比较」。媒体范围改为：把句段毫秒换回秒，再和 `media.duration` 比。没有文献轴。
    - ADR-0088 第 12 条里「语段时间是文献轴秒，播放器时间由 `offsetSec + scale × 文献秒` 换算，改映射不改语段时间」，以及 `logical_duration_sec`、`time_mapping_json`、`time_mapping_history_json` 这三列。
    - ADR-0094 第 3、4 条里「按当前映射把媒体秒换成文稿秒，并核对映射修订」。预览和接受直接使用录音上的整数毫秒。生命周期凭据和目标范围内已有转写的指纹仍要核对；整体调时改的是句段毫秒，指纹对不上就拒绝。
    - ADR-0091 第 5 条里把「时间映射修订」当作一把独立凭据。该凭据随映射列一起消失，其余凭据仍各管各的。

## 未选方案

- **只有库用毫秒，页面继续传秒**：拆分、相接和 10 毫秒微调会建在浮点秒上。
- **改成毫秒但沿用 `startTime` 字段名**：单位变了名字没变，漏改处类型检查报不出来。
- **给没录音的句段编一段虚拟时间**：时间轴代码不用分支，但假时间会进导出和检索。
- **保留文稿到录音的映射**：少一次改写，句段时间却不再是录音上的毫秒。
- **没对齐的两段禁止合并**：少一个确认框，长文献得先补时间才能合并。
- **第一程不做无录音文稿，表也先不改**：29 落地后再改一次表。

## 影响

- DDL 在 `src/db/desktop/schema.ts`，冻结记录在 `src/db/desktop/formatFreeze.record.json`。代码现为 29。
- 读句段时间的桌面路径（`units.ts`、`unitSpan.ts`、`foreignImport.ts`、`corpusQuery.ts`、`modelRuns.ts`、`operationContract.ts` 和桌面页面）随 1b-0 改名。
- 旧页面共用的映射服务不改。桌面不再写入映射列。
