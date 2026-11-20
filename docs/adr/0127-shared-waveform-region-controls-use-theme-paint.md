---
title: ADR 0127 - 共享波形上的选区按钮和速度滑杆改用主题色实底
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-19
source_of_truth: decision-record
depends_on:
  - ./0114-restrained-theme-accent-three-tier-scale.md
  - ./0115-timeline-waveform-and-segment-highlights.md
---

# ADR 0127：共享波形上的选区按钮和速度滑杆改用主题色实底

## 背景

选区浮层上的动作按钮和速度滑杆写在 `transcription-waveform.css`，桌面转写页和旧转写页用的是同一套类。原先是半透明底、信息蓝和 11px 粗标签。

2026-11-19 用户决定采用新画法，不再要求旧转写页、标注页、分析页保持这几处的旧样子。波形选区、波峰和当前语段仍按 ADR-0115；全稿概览仍按 ADR-0125。

## 决定

1. **动作按钮**用实底：边框 `--border-control`，底 `--surface-panel`。悬停边框改为 `--text-secondary`。按下底为 `--theme-accent-tint`。选中态底 `--brand-tint`、字和图标 `--mark-secondary`。
2. **速度滑杆**的已填充段用 `--brand-solid`，未填充段用 `--border-soft`。圆点为 `--brand-solid`，外圈 `--surface-panel`。读数 12px、字重 400。复位态与选中按钮同一套主题色。
3. 这两处类被哪一页用到，就跟着改。不另做一套只给桌面的按钮样式。

## 未选方案

- **把新画法只加在桌面类名上，共享类退回旧样式。** 旧页和桌面会各画一套选区按钮。
- **连波形选区和语段块一起改色。** 那是 ADR-0115 的范围，这次不动。

## 影响

- `src/styles/pages/transcription-waveform.css` 的 `.region-action-btn` 与 `.segment-speed-slider`。
- `DESIGN.md` 与 `design/jieyu-paper/DESIGN.md` 的播放条补上这一句。
