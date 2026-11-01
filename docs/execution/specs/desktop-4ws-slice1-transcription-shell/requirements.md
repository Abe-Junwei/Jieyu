---
title: desktop-4ws-slice1-transcription-shell requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-4ws-slice1-transcription-shell-spec
---

# Requirements — desktop-4ws-slice1-transcription-shell

## 1. What & Why

- **要做什么**：桌面 `/transcription` 进入独立转写工作区壳（与工程读页分流）；复用单库读改与切片 0 的事件／Query／草稿守卫；flag 默认关。
- **为什么现在做**：切片 0 已合入；4ws 清单切片 1；板 27 精稿已定稿。
- **不做什么**：不重造波形引擎；不做 VAD／口译；不默认开 flag；不接完整 ReadyWorkspace Dexie 编排。

## 2. 用户场景

1. 研究者在 Electron 打开项目后，从侧栏进转写，看到工作区壳（上下文／主编辑／检查器），不是工程交换页合流体验。
2. 改正文保存仍走切片 0：成功刷新、失败留草稿、可拦离开。
3. flag 关时行为与合入前一致（`/transcription` 仍用工程读页）。

## 3. 验收标准

- [ ] flag `desktopTranscriptionWorkspaceEnabled` 默认 `false`；为 true 时 `/transcription` 挂独立页
- [ ] `/desktop-project` 仍承担交换／删除等工程职责
- [ ] 独立页可列出语段、播音频、改正文并经 `unit.textSaved` 刷新
- [ ] 定向 vitest 覆盖 flag 分流；typecheck 通过

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Flag | `src/ai/config/featureFlags.ts` | 新增 |
| 路由 | `src/App.tsx` | `/transcription` 分流 |
| 页面 | `src/pages/DesktopTranscriptionWorkspacePage.tsx` | 新增壳 |
| 复用 | `useDesktopProjectReadController`／`DesktopProjectReadView` | 装配 |
| 样式 | `desktop-transcription-workspace.css` | 新增壳布局 |
| 测试 | `DesktopTranscriptionWorkspacePage.test.tsx` | 新增 |
