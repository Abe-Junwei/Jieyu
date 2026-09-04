---
title: annotation-token-edit requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-04
source_of_truth: annotation-token-edit-spec
---

# Requirements — Annotation Token Edit (B4a-2)

## 1. What & Why

- **要做什么**：在 B4a-1 只读 IGT 壳上开放 token POS / gloss 受控编辑；Enter 保存留位，Ctrl+Enter 仅在保存成功后跳下一行；写 `unit_tokens` 后 requery readback。
- **为什么现在做**：主路线图 B4a-2 / 三页联动 P0-3 上半核心；B4a-1 已提供行与键盘骨架。
- **不做什么**：不写 `layer_units`；不做 morpheme / 分词 / Leipzig Validator / 词典链接编辑（B4b）；不接行内播放；不调用 `AutoGlossService.glossUnit`；不注入 `useTranscriptionAnnotationController` / `useTranscriptionUnitActions` / `annotationAdapters` / ChatWindow；不改 flag 默认值。

## 2. 用户场景（≤ 3 条）

1. Flag 开：在输入态改 POS/gloss，Enter 后同一行读回已保存值。
2. Ctrl+Enter 保存失败时焦点不跳行；成功后焦点到下一句段并保持输入态。
3. Flag 关：`/annotation` 仍是占位面板。

## 3. 验收标准（可测）

- [ ] 保存走 `LinguisticService.units.updateTokenPos` / `updateTokenGloss`，随后 `listTokensByUnitIds`（或 `listTokensByUnitId`）readback 与写入一致
- [ ] `commitStay` 不改 `focusedUnitId`；`commitNext` 仅成功后前进
- [ ] 输入态 Space 写入格子，不触发 `playToggle`
- [ ] `annotationPageEnabled` 默认 `false`；不改 ChatWindow

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| Controller | `useAnnotationWorkspaceController.ts` | 草稿 + 提交 |
| Helper | `annotationTokenDrafts.ts` / `saveAnnotationIgtRowTokens.ts` | 脏检查 / 写+readback |
| UI / CSS | `AnnotationWorkspace.tsx` / `annotation-workspace.css` | 受控 input |
| i18n | `dictKeys.ts` / 字典 | 标签与保存态 |
| 测试 | `annotationTokenDrafts.test.ts` / `saveAnnotationIgtRowTokens.test.ts` / `AnnotationPage.test.tsx` | 新增 / 修改 |

## 5. 已知风险与依赖

- 转写页 `unit.words` 是镜像，本页不乐观补丁；转写需 reload 才见标注页写入。
- Gloss 展示走 `pickDefaultTranscriptionText`（优先 `default`）；写入必须回写同一 lang key，避免默认 `eng` 与 `default` 分裂。
- 无现成 POS 词类集，本切片用文本框而非下拉。
