---
title: ADR 0116 - 页面级通知只用提示条，动作必须有常驻入口
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-16
source_of_truth: decision-record
depends_on:
  - ./0109-design-system-no-info-blue-noto-ipa-and-menu-target.md
  - ./0114-restrained-theme-accent-three-tier-scale.md
---

# ADR 0116：页面级通知只用提示条，动作必须有常驻入口

## 背景

设计系统反馈页同时有页顶文案横幅和墨色提示条，但提示条只有两个静态样例，没有规定位置、时长、堆叠和读屏。转写精稿补样态时把保存中、核实中、失败、只读等全写成页顶横幅，样态之间只差一行字，且与「失败就近显示」冲突。

暗色下 `--fg` 是米白 `#F4F2EC`，墨色壳直接反转后，警告点 `#FBBF24` 在米白上不到 2:1。

对照 Radix Toast（自动关闭的 toast 不应被挂着等待用户回应，F8 跳到通知区，悬停／焦点／失焦暂停计时）、Material 3 Snackbar（单条动作、靠近底部）、Carbon（toast 与 inline 通知分工，错误类可不自动关闭）与 Sonner（右下堆叠、上限条数）。

## 决定

1. **不用页顶文案横幅**。页面级通知只用提示条；表单与对话框里的就地反馈仍用面板内提示，两者不重复弹。
2. **提示条只负责告知**。带的每个动作都有常驻入口：句段失败标记与重试、底栏保存状态片、编辑菜单与快捷键、菜单栏。关掉提示条不清除状态。阻塞错误仍走两类桌面阻断，不靠提示条。
3. **四类与时长**：结果 4 秒（带动作 8 秒，悬停、焦点、窗口失焦暂停）；进行中超过 300ms 才出现、不自动关闭、原位变成结果；需要处理（失败带重试，核实中不带动作）不自动关闭；常驻情况（恢复快照、只读窗口、离线）出现一次，关掉后由底栏或工具栏状态承接。
4. **位置与堆叠**：当前工作区底部居中，底栏上方 32px（按工作区居中，不按整窗）；最多 3 条，新的在下，超出先收最早的「结果」，「需要处理」不被挤掉；同一件事原位更新。
5. **外壳 token**：新增 `--toast-bg` / `--toast-fg` / `--toast-border`。亮色墨底白字；暗色用 `#2C2B28` 暖黑、`#F4F2EC` 字、`#3A3832` 发丝边（字 12.65:1，成功／警告／错误点 8.12 / 8.48 / 4.93:1；亮色点 5.73 / 5.93 / 3.91:1）。

## 未选方案

- **保留横幅给常驻情况（离线、只读）**：占一整行布局，且与提示条两套外观并存。改为出现一次的提示条，加底栏状态承接。
- **按语义给提示条整块上浅色底和彩色描边**（产品现有 `global-toast.css` 的做法）：违反「墨色壳 + 色点」与 ADR-0109 不设信息蓝。
- **通知中心与历史列表**：DESIGN.md 已明确不收录。

## 影响

- 更新 `src/styles/tokens.css`、`scripts/build-od-design-tokens.mjs`、`design/jieyu-paper/tokens.css`、`DESIGN.md`、`preview/preview.css`、`preview/components-feedback.html`，以及 Open Design 转写精稿的样态。
- 产品 `src/styles/foundation/global-toast.css` 位置同为底部居中，但外观是彩色胶囊，与本规范不一致，由后续产品切片对齐，本 ADR 不改产品组件。
