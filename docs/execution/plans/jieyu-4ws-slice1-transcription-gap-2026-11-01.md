---
title: 四页切片 1 · 转写复杂度差额与精稿定稿
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-11-16
source_of_truth: execution-plan
depends_on:
  - ./jieyu-4ws-impl-checklist-2026-10-31.md
  - ../../DESIGN.md
---

# 转写切片 1 · 复杂度差额（相对设计系统）

> **精稿待定（2026-11-16）**：外观已定为「纸本田野笔记」（[ADR-0103](../../adr/0103-paper-field-notes-is-the-only-appearance.md)–[ADR-0107](../../adr/0107-motion-compact-height-selection-and-shortcuts.md)），设计系统包在 `design/jieyu-paper/`。转写主工作区精稿在 Open Design 里按该包重画（[ADR-0102](../../adr/0102-desktop-design-drafts-move-to-open-design.md)），尚未定稿。实现规格：[desktop-4ws-slice1-transcription-shell](../specs/desktop-4ws-slice1-transcription-shell/)。

## 壳层（规范与预览页已覆盖）

| 项 | 规范／预览页 | 代码落点 |
| --- | --- | --- |
| 52px 轨、上下文 + 主区、无右栏检查器、双层边框 | DESIGN §1／§4／§7；`preview/components-shell.html` | 应用壳；面板 CSS |
| 墨色 CTA／选中底比悬停深一档／墨色焦点环／墨色播放头 | DESIGN §2／§7；ADR-0104、ADR-0107 | `src/styles/tokens.css` |
| 内联保存失败浅底+重试；结果未知禁重试/放弃；离开守卫 | DESIGN §5；`preview/components-feedback.html`、`components-overlays.html` | Toast／PanelFeedback／离开对话框 |
| 1280／窄窗先收上下文；暗色同壳；空媒体 | DESIGN §1／§7 | 窗口适配后续接线 |

## 只缺应用稿／精稿细化（同壳派生，不改规范）

| 差额 | 说明 | 处理 |
| --- | --- | --- |
| 波形条密度与缩放控件 | `components-media.html` 有播放条、概览与显示模式 | 复用 `Waveform*`；精稿只标控件位 |
| 拖界／切分／合并手柄态 | `components-media.html`、`components-timeline.html` 有拖界吸附与拒绝态 | 规则已在 DESIGN §7 |
| 多选片段 | `components-media.html` 有多选态，右键菜单切批量项 | 精稿补多选角标 |
| AI／助手侧栏 | `components-ai.html` | 非切片 1 必达；侧栏入口占位 |
| 双列对照 | `components-buttons.html` 有多轨／双列切换 | 另稿或后补；默认多轨 |

## 要新规则（本片不发明；另开或延期）

| 差额 | 判定 |
| --- | --- |
| VAD／一键分段、口译轨 | 账本已延期 |
| ReadyWorkspace Dexie 编排整迁 | 工程问题：换 `desktopCall`+事件+Query，不新 UI 规则 |
| 专业查询／完整词典 | ADR-0099；切片 3／4 前 Research |

## 切片 1 精稿交付清单（Open Design 待画）

1. 区域：左轨｜上下文（稿件／层／片段列表）｜主区（播放／波形／多轨时间轴，原文与译文在选中块内就地编辑）；无右栏检查器、无底部「当前片段」区。
2. 主操作：播放／循环、改正文保存（切片 0／1a）、进标注、查找替换、片段拆合删（右键菜单与桌面菜单见 `components-overlays.html`、`components-desktop.html`）。
3. 键盘：焦点环与选中分色；IME 不穿透（切片 0 已有）；快捷键以 `KeybindingService` 为准。
4. 状态：保存中／未知／失败+草稿、离开守卫、1280／窄窗／暗色／空媒体。
5. 组件映射：见 spec design §3／§6（Waveform／受控 Timeline／draft guard）；旧 VerticalView 不得直接挂桌面。

**定稿前**：1a（保存回执／持久草稿／离开）可先做不依赖布局的数据链与测试；1b 波形／时间轴受控展示等精稿定稿后再接。flag 默认 `false`。禁止第二套转写样式。
