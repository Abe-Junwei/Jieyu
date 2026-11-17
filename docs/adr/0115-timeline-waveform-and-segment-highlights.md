---
title: ADR 0115 - 波形选区、概览视窗与当前激活语段接入主题色高亮
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0104-type-space-shadow-and-ink-only-series.md
  - ./0114-restrained-theme-accent-three-tier-scale.md
---

# ADR 0115：波形选区、概览视窗与当前激活语段接入主题色高亮

## 背景

[ADR-0114](./0114-restrained-theme-accent-three-tier-scale.md) 将三档克制主题色接入了壳层左轨与工具栏开关，但主画布的波形与语段轨道仍全部停留在灰墨色：

1. 波形选区用 `--selection` 加 `mix-blend-mode: multiply`，亮色下与暖纸底几乎无差，暗色下正片叠底发黑，且全段波峰同为高浓度墨色，看不出哪一段声音对应当前语段。
2. 转写主层正在编辑的语段与释义从属层同时间对齐的语段共用同一种 `--selection` 灰底，无法区分「当前操作焦点所在层」与「跨层伴随对齐段」。
3. 全稿概览视窗框、拖边界吸附引导线与静态播放头同为纯墨色，缺少层次。

对照 Descript、ElevenLabs Studio 与 Audition / WaveSurfer 的克制时间轴做法：非选区波形退后，仅点亮当前选区时间窗及其内部波峰，并区分主激活片段与伴随片段。

## 决定

1. **波形选区与波峰分层**：非选区波峰降为 `var(--fg-2)` 半透明（约 `0.42`）；选中时间窗 `.region` 使用 `--brand-tint` 底加左右 `1px solid var(--secondary)` 边界线（取消 `multiply` 混合），落在该时间窗内的波峰使用 `--secondary`（亮 `8.29:1`、暗 `7.99:1`）。播放头保持 `2px` 墨色／暖白 `--playhead` 实线，且仅画在波形画布内。
2. **全稿概览视窗框**：`.mini .vp` 边框改为 `1.5px solid var(--secondary)` 并铺极淡主题色透明底，与概览内的播放头墨线区分。
3. **当前激活语段 vs 跨层伴随对齐段**（局部更新 [ADR-0104](./0104-type-space-shadow-and-ink-only-series.md) 第 4 条与 [ADR-0114](./0114-restrained-theme-accent-three-tier-scale.md) 第 2 条中的时间轴选中规则）：
   - **当前激活／编辑语段（`.seg.sel`）**：使用 `--brand-tint` 浅底 + 左侧 `2px` `--brand` 锚条 + `--brand` 文本光标，语段正文仍为 `--fg`（亮 `16.31:1`、暗 `14.09:1`）；叠加键盘焦点时外圈仍为 `1.5px` `--focus-color` 石墨细环。
   - **跨层时间对齐伴随段（`.seg.linked`）**：保留中性灰 `--selection`（亮 `#ECECEC`、暗 `#282825`），不与当前激活层争抢视觉焦点。
   - **未选中语段**：保持 `--surface-warm` 底与各层墨色线型。
4. **点层选中、拖边吸附与检索命中**：选中的点层菱形 `.pin.sel` 用 `--brand` 填充配 `--secondary` 描边；拖边界激活手柄与吸附虚线引导线用 `--secondary`；语段正文内的检索命中词用 `--brand-tint` 底加 `--secondary` 下划线。红色在时间轴上仍只表示保存失败。

## 未选方案

- **按说话人或按层给整条轨道的语段铺不同彩色**：违反 ADR-0104，且与保存失败、低置信度下划线冲突。
- **在暗色下直接用 `--brand`（`#5B5BD6`）画细波峰**：对暖黑底对比度仅 `2.93:1`；改用 `--secondary`（`#B6B2F2`）可达 `7.99:1`。

## 影响

- 更新 `DESIGN.md`、`SKILL.md`、`design/jieyu-paper/preview/components-timeline.html`、`components-media.html` 及 Open Design 转写精稿 `index.html`。
