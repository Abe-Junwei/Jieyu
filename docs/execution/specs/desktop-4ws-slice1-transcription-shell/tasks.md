---
title: desktop-4ws-slice1-transcription-shell tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-4ws-slice1-transcription-shell-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — desktop-4ws-slice1-transcription-shell

## Implementation tasks

- [x] T1 注册 `desktopTranscriptionWorkspaceEnabled`（默认 false）→ 验证：typecheck
- [x] T2 新增 `DesktopTranscriptionWorkspacePage` 壳 + CSS（过渡三栏；目标对齐板 51 上下文+主区、无右栏检查器）→ 验证：定向 vitest
- [x] T3 `App.tsx`：flag 开时 `/transcription` 挂新页，否则保持读页 → 验证：页面测试
- [ ] T4 复用 Waveform／Timeline 组件接 `desktopCall`（boundary／split／merge）→ 验证：Electron 合成 + vitest
- [ ] T5 核对片段起止／说话人／备注现有操作入口，按已确认设计接单库 → 验证：重开读回
- [ ] T6 `tests/e2e-desktop` 增 flag 开路径冒烟 → 验证：`npm run test:e2e:desktop-project`（或等价）

## Pre-merge gates

- [x] `npm run typecheck`（本片改动后跑）
- [x] `npx vitest run src/pages/DesktopTranscriptionWorkspacePage.test.tsx`
- [x] 不适用：本片未改 ReadyWorkspace 编排热点文件
- [x] 不适用：未改 `src/ai/**` 业务（仅 featureFlags）
- [x] `npm run check:docs-governance`
- [x] Feature flag 默认 `false`

## 后续（不阻塞壳合并）

波形／时间轴及片段操作接线为 T4–T6；完成后删本 spec 目录（ADR-0051）。

## 2026-11-02 准入复核

- [x] 回读现有页面/controller/草稿守卫，完成design §6映射与实现差额。
- [ ] 转写主稿/状态改由 Open Design 新精稿核准（ADR-0102；ADR-0101 重新打开 Penpot 板 51–61）；定稿前 T4–T5 只做不依赖布局的数据链与测试。
- [ ] 复用候选props与媒体生命周期适配、冻结格式/关闭链协议核完后才标准入完成。
