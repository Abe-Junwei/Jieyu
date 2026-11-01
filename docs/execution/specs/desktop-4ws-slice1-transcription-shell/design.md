---
title: desktop-4ws-slice1-transcription-shell design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-4ws-slice1-transcription-shell-spec
depends_on:
  - ./requirements.md
---

# Design — desktop-4ws-slice1-transcription-shell

## 1. 成熟方案扫描 / Research

- 仓库既有：`DesktopProjectReadPage` + `useDesktopProjectReadController` + 切片 0 事件／Query／`useDesktopDraftGuard`；浏览器侧 ReadyWorkspace 为成熟时间轴／波形宿主。
- 同类产品：ELAN／Praat 式「壳 + 波形 + 段列表 + 检查器」；本仓已有板 27 应用主稿。
- Best practice：feature flag 默认关替换在用桌面页（4ws 清单 §原则 7）；复用而非重写波形。
- 反模式：在简化读页继续堆交互；第二套转写视觉；把草稿放进 Query。
- 坑：ReadyWorkspace 深绑 Dexie——本片只做独立壳 + 单库已有读写；波形全量复用另任务，避免一次 PR 拖入编排层热点。
- **决定：适配** — 新页装配既有 desktop controller／ReadView；壳布局对齐板 27；波形／Timeline 组件映射后续任务逐条迁。

## 2. 架构选择

- 落位：`routing` + 页面装配；业务写路径仍在 controller／desktopCall。
- 选 A：独立页 + flag 分流。拒 B：继续在 `DesktopProjectReadPage` 加模式开关（工程／转写职责继续纠缠）。

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `featureFlags.ts` | `desktopTranscriptionWorkspaceEnabled` 默认 false |
| `App.tsx` | flag 开时 `/transcription` → 新页 |
| `DesktopTranscriptionWorkspacePage.tsx` | 壳：上下文条 + ReadView 主区 + 检查器栏 |
| `desktop-transcription-workspace.css` | 最多两层边框的壳布局 |
| `DesktopTranscriptionWorkspacePage.test.tsx` | 有 host 时渲染壳；文案分区 |

## 4. ADR

- ADR-0086 白名单内「既有能力 SQLite 接替」；ADR-0099 不在本片实现词典／查询。
- 不新开 ADR。

## 5. Flag

- 名：`desktopTranscriptionWorkspaceEnabled`；env `VITE_DESKTOP_TRANSCRIPTION_WORKSPACE_ENABLED`；默认 `false`。
