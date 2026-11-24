---
title: ADR 0141 - 录音层不挂文字子层
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-24
source_of_truth: decision-record
depends_on:
  - ./0132-layer-scoped-transcription-and-legacy-create-routing.md
  - ./0140-unit-text-audios.md
---

# ADR 0141：录音层不挂文字子层

## 背景

录音配对曾在录音层下用 `parent_id` 挂一条文字层，并靠这条父子关系找到转写落点。[ADR-0132](./0132-layer-scoped-transcription-and-legacy-create-routing.md) 已经规定 `parent_id` 只表达层级，不推导文本匹配。生成方式也不该决定文字层的地位。

## 决定

1. **录音层不再创建文字子层。** 它仍是 `symbolic-association`、`modality=audio`，首选宿主是那段录音所在的时间对齐转写层。`textName` 仍可随创建请求传入，但不再建层。
2. **转写时由用户选择目标层。** 语音转写可以选宿主转写层、首选宿主相同的 symbolic-association 转写层，或其他独立的时间对齐转写层。口译只能选首选宿主相同的 symbolic-association 翻译层。没有这种翻译层时，在转写这一步新建，不挂到录音层下。
3. **同一宿主的文字层写在录音所在的那条语段上，不复制边界。** 选中宿主层本身时必须确认，因为会盖掉该语段已有转写。另一条独立转写层只接受恰好一条完全包住录音时间的语段（`target.start <= source.start && target.end >= source.end`）。比录音更长时要先说明。两条及以上由用户选一条，不新建。一条都没有且该层已有语段时，确认后按录音时间新建。该层没有语段时直接新建并写入。部分重叠不算命中。
4. **新建语段复制说话人。** 同一说话人时间重叠时停止并说明，不改成空说话人。新建走和手建语段相同的撤销栈与编辑回执。目标语段已有草稿则拒绝，不替换。
5. **来源记 `unit_text_audios.id`。** 草稿 `provenance_json` 继续带 `audioId`、`fileId`、`audioLayerId`。不记 `position`。引擎来源按目标语段 id 加文字层 id 记住。
6. **打开项目时清掉父层为录音层的文字层 `parent_id`。** 不升 `user_version`，不写迁移器。此后删除录音层不再顺着这条父子关系带走文字。恢复录音层不会把文字层挂回去。
7. **宿主语段拆分或合并时，录音跟着宿主走。** 已经写在独立层上的正文不动。这是有意的：录音附着在宿主语段上，独立层上的正文有自己的语段。

## 未选方案

- **新造一种层类型。** `time-aligned` 与 `symbolic-association` 已经够用。
- **把文字层做成录音层的 Symbolic Association 子层。** 删除录音层会带走已确认的文字，文字的地位又被生成方式决定。
- **部分重叠也写入。** 边界对不上时写进半截语段会把正文放错位置。

## 影响

- 旧项目在下次打开时去掉录音层上的 `parent_id`。格式仍是 35。
- 转写入口先选目标层。宿主层、更长语段、以及非空层上新建语段都要经过确认。
