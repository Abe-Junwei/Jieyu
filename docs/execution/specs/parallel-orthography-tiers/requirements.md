---
title: parallel-orthography-tiers requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-11-24
source_of_truth: parallel-orthography-tiers-spec
---

# Requirements — parallel-orthography-tiers

## 1. What & Why

- **要做什么**：在当前时间对齐转写层上添加平级的正字法转写，共用它的语段，各层只存自己的正文。
- **为什么现在做**：新建转写层各自拥有语段，拼音和汉字对不齐 IPA。
- **不做什么**：不新增层类型，不复制 unit，不把翻译层改名，不从 IPA 自动生成，不把时间主人换成另一种写法，不兼容旧录音文字层；2026-11-24 用户明确本片只完善 EAF 序列化，桌面导出入口另做。

## 2. 用户场景（≤ 3 条）

1. 用户在 IPA 层选择「添加正字法转写」，得到空的拼音层；之后在任一层建段、改边界，其他层跟着同一套语段。
2. 拼音层有未保存录音草稿时，在 IPA 层合并或拆分会先确认；不确认则正文和草稿都不变。
3. 在拼音层删除只清空这一格；删除整段只能在时间锚点层上做。

## 3. 验收标准（可测）

- [x] 新层是 `symbolic-association` + `transcription` + `text`，只挂当前这套的一条 `time-aligned` 转写宿主。宿主不是这种层，或要挂第二个宿主，写入被拒绝且库不变。
- [x] 合并确认把未保存草稿单独标出。确认后该层正式正文含草稿并删掉草稿；不确认则关掉再打开，正式正文和草稿与合并前相同。
- [x] 从正字法层清空一格后，其他层正文还在；关掉再打开仍在；撤销只恢复这一格。锚点层删除仍删整段，撤销恢复整段。
- [x] 拆分切正式正文。其他层草稿整段留在左段且不提交。确认期间正文或草稿变了则拒绝，库不变。
- [x] 时间锚点仍有有效正字法层时，`layers.delete` 的普通删除、清除和迁移删除均拒绝；正文为空也保护。先删除正字法层后才允许删锚点；保留期内的恢复与清除不得留下有效层指向已删除宿主。拒绝后重开，所有正文和草稿不变。
- [x] 单格和批量清空以 `(unitId, textLayerId)` 为身份，只清除本层正式正文与草稿；重复请求不重复入撤销栈，撤销前本格已变化则拒绝覆盖。翻译层同样覆盖，锚点删除保留原整段语义。
- [x] 拆分后草稿 `base_body` 与左段正式正文不同，必须显式呈现冲突；保留、舍弃、确认覆盖可选。普通保存、自动保存、再次拆分不得静默覆盖；确认覆盖后只改左段，右段及其他层不变，重开与撤销读回一致。
- [x] 导出的符号关联转写层对每个宿主语段都有一条标注，没有正文的是空标注。输出必须是 `REF_ANNOTATION`，引用本组时间宿主；两个独立语段组不得串组，宿主正文为空也须有可引用的父标注。本项验收只覆盖序列化输入到 EAF XML；不代表桌面已有 EAF 导出入口。

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Controller | `src/pages/useDesktopTranscriptionLayerController.ts` | 只装配新入口 |
| 纯函数 | `src/pages/desktopTranscriptionLayerCommands.ts`、`desktopTranscriptionLayerDrop.ts` | 修改 |
| Schema / DB | `src/db/desktop/layerHosts.ts`、`unitMerge.ts`、`unitSplit.ts`、`unitEdges.ts`、`layerStructure.ts`、`operationContract.ts`、`desktopCall.ts`、`sessionEdit.ts`、`textSave.ts` | 修改 |
| 界面接线 | `src/pages/desktopTranscriptionEdgeActions.ts`、`useDesktopTranscriptionEdgeController.ts`、`useDesktopTranscriptionSplitController.tsx`、`useDesktopTranscriptionMergeController.tsx`、`useDesktopProjectReadController.ts`、`DesktopTranscriptionLayerList.tsx`、`DesktopTranscriptionLayerLabel.tsx` | 修改并核对实际调用链 |
| 新增模块 | `src/db/desktop/unitTextClear.ts`、`unitSplitTextPlan.ts`、`src/desktop/useDesktopDraftConflict.ts`、`src/pages/DesktopTranscriptionSplitDialog.tsx`、`DesktopTranscriptionDraftConflictDialog.tsx` | 按层快照/清空、拆分预览、草稿冲突状态与确认 UI |
| 导出 | `src/services/eaf/eafExportAdditionalTiers.ts` | 修改 |
| i18n | `src/i18n/dictKeys.ts`、`src/i18n/dictionaries/*` | 新键 |
| 测试 | 上列文件旁的 `*.test.ts` | 新增 |

## 5. 已知风险与依赖

- 层控制器已 299 行。新入口的参数组装不得再写进该 hook。
- 不改 `user_version`，不改已冻结的 `layer_links` 触发器。拒绝放在 `insertHostLinks` / `setHosts`。
- 决定来自 [调研稿](../../plans/parallel-orthography-tiers-research-2026-11-24.md) 规则 1–12。
