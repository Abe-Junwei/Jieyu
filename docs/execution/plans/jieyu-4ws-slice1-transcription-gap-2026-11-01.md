---
title: 四页切片 1 · 转写复杂度差额与精稿定稿
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-11-01
source_of_truth: execution-plan
depends_on:
  - ./jieyu-4ws-impl-checklist-2026-10-31.md
  - ../../DESIGN.md
---

# 转写切片 1 · 复杂度差额（相对板 27）

> **精稿定稿（2026-11-01）**：以 Penpot 板 **27** 为壳 SSoT；本表只列 ReadyWorkspace 真复杂度相对 27 的差额。不另起同类转写默认板。实现规格：[desktop-4ws-slice1-transcription-shell](../specs/desktop-4ws-slice1-transcription-shell/)。

## 壳层（板 27 已覆盖 · 规范已覆盖）

| 项 | 板／规范 | 代码落点 |
| --- | --- | --- |
| 52px 轨、零缝隙、双层边框 | DESIGN §1／§4；板 27 | 应用壳；面板 CSS |
| 墨色 CTA／中性选中 `#E0E0E0`／焦点 `#026370`／播放头 danger | DESIGN §2／§7；板 27／45 | `tokens.css` |
| 内联保存失败浅底+重试 | DESIGN §5；板 29 | Toast／PanelFeedback |
| 1280 折叠检查器／窄窗／暗色同壳 | 板 43／44／45；DESIGN §1 | 窗口适配后续接线 |

## 只缺应用稿／精稿（同壳派生，不改规范）

| 差额 | 说明 | 处理 |
| --- | --- | --- |
| 波形条密度与缩放控件 | 27 有示意波形，缺缩放／滚动画布精稿 | 复用 `Waveform*`；精稿只标控件位 |
| 拖界／切分／合并手柄态 | 12 有迷你态；27 未展拖动手势全态 | 同壳补差异层，规则已在 DESIGN §7 |
| 多选片段 | 27 单选 012 | 选中仍用 tint；补多选角标应用稿即可 |
| AI／助手侧栏 | 27 未画 | 非切片 1 必达；侧栏入口占位 |
| 空／加载／无媒体 | 09 有规范；27 为有语料态 | 套 09，不新规则 |

## 要新规则（本片不发明；另开或延期）

| 差额 | 判定 |
| --- | --- |
| VAD／一键分段、口译轨 | 账本已延期 |
| ReadyWorkspace Dexie 编排整迁 | 工程问题：换 `desktopCall`+事件+Query，不新 UI 规则 |
| 专业查询／完整词典 | ADR-0099；切片 3／4 前 Research |

## 切片 1 精稿交付清单（定稿）

1. 区域：项目上下文｜主编辑（波形+时间轴+原文）｜片段检查器 — 对齐板 27。
2. 主操作：播放／循环、改正文保存（切片 0）、进标注、检索片段。
3. 键盘：焦点环与选中分色；IME 不穿透（切片 0 已有）。
4. 状态：加载／保存中／失败（板 29）／空媒体。
5. 组件映射：见 spec design §3（Waveform／Timeline／ReadView 文本／draft guard）。

**定稿结论**：可开切片 1 代码（flag 默认 `false`）。波形／时间轴以复用接线为主；禁止第二套转写样式。
