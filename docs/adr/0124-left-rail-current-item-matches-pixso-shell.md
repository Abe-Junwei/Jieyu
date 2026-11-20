---
title: ADR 0124 - 左轨当前项以转写精稿标准帧为准
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-18
source_of_truth: decision-record
depends_on:
  - ./0114-restrained-theme-accent-three-tier-scale.md
  - ./0118-pixso-is-the-design-draft-workspace.md
---

# ADR 0124：左轨当前项以转写精稿标准帧为准

## 背景

[ADR-0114](./0114-restrained-theme-accent-three-tier-scale.md) 把左轨当前项写成 `--brand-tint` 浅底加左侧 2px `--brand-solid` 指示条。「17 壳层」里的 `nav.rail` 又画成 36×36 浅底。用户指定的设计稿是精稿页「标准」帧 `19:6187`（`page-id=19:6184`）。这一帧上的当前项是铺满轨宽大部分的实心靛青块，图标为浅色。

2026-11-18 用户确认：左轨以这一帧为准，不以浏览器里量到的实现为准。

## 决定

1. **替换 ADR-0114 里「左轨当前项左侧 2px 指示条」这一处。** 三档主题色的其余用途不变：复选框、单选、开关、进度和滑块仍用 `--brand-solid`；工具切换和筛选胶囊仍用浅底加 `--mark-secondary`。
2. **左轨尺寸按帧 `19:6187`。** 轨宽 52px。导航项 44×44、圆角 `--radius-md`、间距 8px，在 52px 轨内左右各留 4px。图标 20px，居中。
3. **当前项为 `--brand-solid` 实心块，图标 `--brand-on`。** 不用浅底，不画左侧色条。未选中项保持正文墨色。

## 未选方案

- **按「17 壳层」`nav.rail` 的 36×36 浅底。** 那不是用户指定的精稿帧。
- **按浏览器里已经画出来的按钮回量。** 那只是实现，不是设计稿。

## 影响

- `design/jieyu-paper/DESIGN.md` 里左轨当前项的那一句改成与本篇一致。
- `src/styles/pages/app-shell-layout.css` 的左轨按钮按 44×44 实心块实现。
