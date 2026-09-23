---
title: lexicon-sense-reorder requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-23
source_of_truth: lexicon-sense-reorder-spec
depends_on:
  - ../lexicon-sense-tree/requirements.md
---

# Requirements — Lexicon Sense Reorder

## 1. What & Why

- **要做什么**：`/lexicon` 额外义项可在同级内上移/下移（含子树整块），保存后 `senses[]` 顺序 readback；LIFT 入站按 `order` 排同级。
- **为什么现在做**：B3g 之后 M3 余量是义项排序。FLEx 的命令是 Move Sense Up/Down，不是拖拽。
- **不做什么**：拖拽库；提升/降级（改 parentId）；把额外义项换成主 gloss；跨词条搬义项；DMLex；词形排序；新 flag。

## 2. 用户场景（≤ 3 条）

1. 两个同级额外义项点「下移义项」，保存后详情列表顺序对调，parentId 不变。
2. 子义项整块跟着父义项移动，不插进别的子树中间。
3. LIFT 里 `order` 与文档顺序不一致时，导入后按 `order` 排列。

## 3. 验收标准（可测）

- [x] `moveSenseSiblingBlock` 同级交换且子树不拆
- [x] 边界方向返回原数组
- [x] 保存后 `senses` gloss 顺序为移动后的顺序
- [x] `parseLiftXml` 按 sense/subsense `order` 排序；缺 `order` 仍用文档顺序
- [x] 无新 flag

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `lexemeSenseTree.ts` | 同级块移动 |
| Helper | `lexiconLiftImport.ts` | `order` 排序 |
| Controller / form | edit controller + form | 上移/下移按钮 |
| 测试 | tree / import / LexiconPage / controller | 新增 |
