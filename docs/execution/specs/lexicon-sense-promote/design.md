---
title: lexicon-sense-promote design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-24
source_of_truth: lexicon-sense-promote-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Promote / Demote

## 1. 成熟方案扫描 / Research

- 仓库既有：`senses[].parentId` 邻接表；`senses[0]` 是主 gloss；额外义项在 `extraSenses`。B3h 只交换同级块，不改父级。LIFT 出站已按 `parentId` 写成 `<subsense>`。
- 同类产品：FLEx Lexicon Edit 把 Promote 和 Demote 与 Move Up/Down 分成不同命令。降级是挂到上一个同级义项下面；提升是升到父义项的上一级。官方说明拖到顶层义项上不能重排或改层级，应使用这些命令（[Reorder, demote or promote a sense](https://downloads.languagetechnology.org/fieldworks/Documentation/en/Using_Tools/Lexicon_tools/Lexicon_Edit/Reorder_demote_or_promote_a_sense.htm)）。
- 业内：LIFT 0.13 仍用 `<subsense>` 表达层级，没有单独的 promote 元素。改 `parentId` 后再导出就会变成对应的嵌套。DMLex 不是这一刀的交换格式。
- 公认不可行：用拖拽改父级；提升时替换主 gloss；为层级再引入嵌套 `senses[]` 或新 Dexie 表。
- 潜在的坑：把根额外义项（空 `parentId`）和主 gloss 的子义项当成同一组同级；降级时上一同级还没有 `id`；深度超过现有 8 层上限。
- 决定：**适配** FLEx Promote/Demote（只改 `parentId`）。**复用** B3g 邻接表与现有 LIFT `<subsense>` 出站。**不引入**拖拽依赖，不换主 gloss。无新 flag。

## 2. 架构选择

- 落位：纯函数改 `parentId`；controller 只在降级前补上一个同级或主 gloss 的 `id`
- 拒绝：新 controller；拖拽；主 gloss 与额外义项对调

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `lexemeSenseTree.ts` | `promoteSense` / `demoteSense` / `canDemoteSense` |
| form + controller | 按钮；缺 id 时先赋值再降级 |

## 4. ADR 引用

- 无新 ADR。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 根额外义项的提升按钮禁用，状态不变。
- 某一级的第一个义项不能降级，除非它是根额外义项且可以挂到主 gloss 下。
- 深度已到 8 时降级无效。无 `id` 的上一同级由 controller 先赋 `id`，纯函数不发明 id。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | tree / LexiconPage / controller | pass |
| typecheck | `npm run typecheck` | 0 errors |
