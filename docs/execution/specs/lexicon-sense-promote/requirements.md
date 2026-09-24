---
title: lexicon-sense-promote requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-24
source_of_truth: lexicon-sense-promote-spec
depends_on:
  - ../lexicon-sense-tree/requirements.md
  - ../lexicon-sense-reorder/requirements.md
---

# Requirements — Lexicon Sense Promote / Demote

## 1. What & Why

- **要做什么**：`/lexicon` 额外义项可提升或降级（只改 `parentId`），保存后详情 depth readback。
- **为什么现在做**：B3h 之后 M3 余量是 FLEx 的 Promote / Demote。同级排序已经落地，层级还不能改。
- **不做什么**：拖拽库；把额外义项换成主 gloss；跨词条搬义项；DMLex；词形排序；新 flag。

## 2. 用户场景（≤ 3 条）

1. 主 gloss 下的第二个子义项点「降级义项」，保存后它的 `parentId` 是上一个同级义项，详情缩进加深。
2. 子义项点「提升义项」后升到父级的上一级；主 gloss 的直接子义项提升后变成无 `parentId` 的根额外义项。
3. 已经是根额外义项时提升无效；主 gloss 的第一个子义项不能再降级。

## 3. 验收标准（可测）

- [x] `promoteSense` / `demoteSense` 只改目标行的 `parentId`，数组顺序与子孙 `parentId` 不变
- [x] 不能提升根额外义项；不能降级某级的第一个义项；深度已到 8 不再降级
- [x] 保存后 `senses[].parentId` 与详情 `data-depth` 为降级后的值
- [x] 无新 flag

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `lexemeSenseTree.ts` | 提升 / 降级 |
| Controller / form | edit controller + form | 提升 / 降级按钮 |
| 测试 | tree / LexiconPage / controller | 新增 |
