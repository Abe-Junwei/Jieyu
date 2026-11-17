---
title: ADR 0117 - 当前激活语段用输入焦点的圆角灰边，保留主题浅底
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-17
source_of_truth: decision-record
depends_on:
  - ./0110-focus-graphite-ring-and-soft-ink-halo.md
  - ./0115-timeline-waveform-and-segment-highlights.md
---

# ADR 0117：当前激活语段用输入焦点的圆角灰边，保留主题浅底

## 背景

[ADR-0115](./0115-timeline-waveform-and-segment-highlights.md) 把当前激活语段做成 `--brand-tint` 浅底加左侧 2px `--brand` 锚条，键盘焦点另加 1.5px 石墨环。转写稿上这只读成一道边，和设计系统里已经在用的输入焦点不是同一种控件。

输入框、行内编辑格、时间码框的焦点是同一套（[ADR-0110](./0110-focus-graphite-ring-and-soft-ink-halo.md)）：4px 圆角 `--radius-md`、1px 次墨边 `--fg-2`、3px 淡墨晕 `--focus-ring`（亮 `rgb(17 17 17 / 14%)`、暗 `rgb(244 242 236 / 18%)`），不再加第二道外框。

## 决定

1. 当前激活／正在编辑的语段改用这套输入焦点，底色保持 `--brand-tint`。不再画左侧锚条，也不再叠石墨细环。
2. 未激活语段维持直角、暖底、层系列线；跨层伴随段仍是中性 `--selection`。它们的键盘焦点继续用石墨细环。
3. 保存失败仍把底换成 `--danger-bg`，外框沿用同一套圆角灰边，不另做红框。

## 未选方案

- **保留左锚条，外面再套焦点晕**：两道边叠在一起，仍然不是输入框的样子。
- **激活段改成白底**：主题浅底是选中高亮，去掉就和普通输入框无法区分。

## 影响

- 更新 `DESIGN.md`、`SKILL.md`、`preview/preview.css`、`components-timeline.html`、`components-media.html`，以及 Open Design 转写精稿。
- 波形选区、左轨当前项、选中事件点的主题色用法不变。
