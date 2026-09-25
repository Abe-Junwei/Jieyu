---
title: lexicon-sense-reorder design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-23
source_of_truth: lexicon-sense-reorder-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Reorder

## 1. 成熟方案扫描 / Research

- 仓库既有：`senses[]` 数组顺序即持久顺序；LIFT 出站已写 `order="${siblingIndex}"`（从 0 起）。B3g 用 `parentId`，详情按数组顺序加 depth。
- 同类产品：FLEx Lexicon Edit 的命令是 **Move Sense Up / Move Sense Down**，子义项随父块移动。提升/降级是另一条命令。官方提示：拖到顶层义项上不能用来重排，应改用菜单或把上面的义项往下拖（[Reorder, demote or promote a sense](https://downloads.languagetechnology.org/fieldworks/Documentation/en/Using_Tools/Lexicon_tools/Lexicon_Edit/Reorder_demote_or_promote_a_sense.htm)）。
- 业内：LIFT 0.13 仍是交换真源。FLEx 技术说明里 sense 的 `order` 从 0 起，表示数据里的义项顺序；嵌套仍是 `<subsense>`（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)）。
- 公认不可行：为排序引入 dnd 库；用拖拽改层级；DMLex 当作这一刀的排序格式。
- 潜在的坑：只交换两行会把子义项留在中间；`order` 与 XML 文档顺序不一致时若只信文档顺序，FLEx 文件会排错。
- 决定：**适配** FLEx 上移/下移（整块）+ 入站按 `order` 排序。**复用** 数组顺序与现有出站 `order`。**不引入**拖拽依赖。无新 flag。

## 2. 架构选择

- 落位：纯函数移动 + 既有 controller 一个回调
- 拒绝：新 controller；promote/demote；主 gloss 与额外义项对调

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `lexemeSenseTree.ts` | `moveSenseSiblingBlock` |
| `lexiconLiftImport.ts` | `sortByLiftOrder` |
| form + controller | 按钮与保存顺序 |

## 4. ADR 引用

- 无新 ADR。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 没有同级邻居时按钮禁用，状态不变。
- 无 `order` 的 LIFT 仍按元素顺序。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | tree / import / LexiconPage / controller | pass |
| typecheck | `npm run typecheck` | 0 errors |
