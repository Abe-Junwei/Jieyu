---
title: ADR 0132 - 多层正文共享时间语段并恢复旧版拖建路由
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-19
source_of_truth: decision-record
depends_on:
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0100-desktop-engineering-contract.md
  - ./0122-integer-milliseconds-and-optional-media.md
  - ./0129-edit-receipts-and-undo-guard.md
---

# ADR 0132：多层正文共享时间语段并恢复旧版拖建路由

桌面转写的时间语段由一个 unit 持有时间与说话人；关联文本层通过 `(unit_id, layer_id)` 保存各自正文，空正文不落记录，草稿、正式保存、回执和撤销也必须按该复合身份隔离。显式 `layer_links` 保存一个文本层到多个宿主层的关系及 preferred host，`layers.parent_id` 只表达层级，不推导文本匹配；创建目标、宿主选择、父段约束、说话人继承和命中已有语段转选择均适配旧版路由，波形与文本轨共用一条路由。桌面格式升为 `user_version` 32，旧格式继续严格拒绝且不迁移；只在合成项目上验证。

此结构优于为每个显示层复制时间 unit，因为复制会导致边界和说话人漂移；也优于在 UI 临时拼接宿主文本，因为保存、草稿、撤销和重开读回都必须有稳定的层身份。空投影首次非空保存时才创建正文行。
