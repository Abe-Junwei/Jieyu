---
title: desktop-lexicon-complete-editor requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-lexicon-complete-editor-spec
---

# Requirements — desktop-lexicon-complete-editor（切片 3 门）

> Research／SDD 门：ADR-0099 R05。本目录在切片 3 开工前填实；**现在不写产品代码**。

## 1. What & Why

- **要做什么**：桌面完整词典编辑器接替旧 `/lexicon` 可编辑字段（义项嵌套、引用、附件、删除前迁移／解除）。
- **为什么**：ADR-0099 首发阻断；4ws 切片 3。
- **不做什么**：不直接改冻结格式加列；不把 Penpot 样例当实现通过；LIFT 往返若延期则本片不扩。

## 2. 用户场景

1. 编辑多义项／嵌套字段 → 关闭重开读回，未改字段不丢。
2. 删除仍被引用的义项 → 必须迁移或明确解除后才提交。
3. 从标注链接进词典可见引用；附件预览／解除符合 ADR-0095。

## 3. 验收标准（切片 3 时勾）

- [ ] 现有 `dmlex`／`jieyuLexeme` 可编辑字段盘点表与 UI 一一对应
- [ ] 写入→重开→readback；引用迁移／解除有 Electron 证据
- [ ] 不绕过 ADR-0086 冻结格式

## 4. 代码地图（Explore 初稿）

| 类别 | 路径 |
| --- | --- |
| 桌面页 | `DesktopLexiconPage`／附件面板 |
| 旧完整页 | `LexiconPage`／`LexiconEntryEditForm` |
| 持久化 | `src/db/desktop` lexicon／attachments |
| 设计样例 | Penpot 33–35／47–48 |
