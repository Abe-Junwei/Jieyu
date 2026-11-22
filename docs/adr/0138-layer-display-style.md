---
title: ADR 0138 - 层显示样式
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-22
source_of_truth: decision-record
depends_on:
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0137-oral-draft-provenance.md
---

# ADR 0138：层显示样式

## 背景

转写页的层名要能换正字法、字体、字号、粗体和斜体，拖层高也要反推字号。这些值要关掉再打开还在。现有 `layers.display_font` 读不出来，也没有字号和字形列。字色不恢复。

## 决定

1. **开发格式改为 `user_version` 34。** `layers` 增加 `display_font_size`（8–36 的整数或 NULL，NULL 表示 13）、`display_bold` 和 `display_italic`（NULL 或 1）。不增加字色列，不从旧数据搬字色。
2. **不写迁移器。** `user_version` 不是 34 的 `project.sqlite` 仍以「不是解语项目库」拒绝，文件字节保持原样。
3. **一次写入改齐样式和层高。** 字号变了，层高按现有行高公式取整后写入。拖层高只改高度和反推后的整数字号，不把高度再改成公式值。重置把四个样式列写成 NULL，层高写成 54。
4. **正字法必须属于该层的语言。** 层没有语言，或正字法属于另一种语言时，这次写入整笔回滚。

## 未选方案

- **改写 ADR-0126 的正文。** 29 的决定保持原样，这次是新的版本号。
- **给 33 的库补列。** 冻结规则是拒绝而不是改写。
- **把旧层头组件挂回来。** 时间轴只用新的名牌，功能按这次的列重做。

## 影响

- 冻结记录换成 34 的 DDL 签名。
- 写入在 `layers.setStyle`。`layers.setHeight` 同时写下整数字号。
