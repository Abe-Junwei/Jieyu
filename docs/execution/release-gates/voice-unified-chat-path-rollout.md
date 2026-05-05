---
title: 非听写语音统一聊天路径 — 发布验证与观测
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-05-02
source_of_truth: runbook
---

# 非听写语音统一聊天路径：验证与观测

关联：[voice-unified-chat-path.md](../../architecture/voice-unified-chat-path.md) · [ADR-0027](../../adr/0027-voice-unified-non-dictation-chat-path.md) · [拍板项：TTS / 门禁 / 键入路由](../plans/AI语音拍板项-TTS-发布门禁-键入路由-2026-05-02.md)

本链路**无环境开关**；发布前以构建版本与端到端验证为主，不设「一键关 FF 回滚」分支。

## 自动化回归（与 QA 摘要 1–3 对齐）

发布前 **须**跑 **语音合入快捷命令**（含 ActionId/i18n/LLM 列表契约 + 语音助手 Vitest）——与拍板「语音相关 E2E/自动化门禁 **必跑**」一致（E2E 见下节）：

```bash
npm run check:voice-agent-pre-merge
```

可选加跑与语音结果处理直接相关的单测：

```bash
npx vitest run src/hooks/useVoiceAgentResultHandler.test.ts
```

### 端到端（阻塞发版）

- **拍板**：`npm run test:e2e`（Chromium + Firefox + WebKit）在发版流水线中为 **必跑**；与 [桌面端浏览器支持策略](../../architecture/桌面端浏览器支持策略.md) 中 CI 描述一致。
- 本地快速循环：`npm run test:e2e:chromium`。

## Voice provider manifest / release-stable（拍板口径）

- **何时可标 release-stable**：连续 **N** 个发布周期（建议 **2**，可由 release owner 在发版记录中写明）内，未出现 **P0** 级「manifest 健康 / 引擎降级」故障（定义见 [C 阶段 AI 治理完整落地方案](../plans/C阶段AI治理完整落地方案-2026-04-25.md) 与证据归档）；不满足则不在对外材料中宣称 stable。
- **证据形态（D2-A）**：以 **文档化采样步骤 + 人工归档** 为主（release evidence 目录/执行记录）；不强制新增专用 CI gate 脚本，除非后续单独立项。

## 键入路由战略

- **维持** ADR-0028：键入 **不强制** 经过与语音相同的前置 NLU；无流程变更。

## 手工验收脚本与留痕

- 执行脚本（步骤与证据目录）：[`手工验收执行脚本-非听写语音统一主链-ADR0027-2026-04-26.md`](../archive/manual-validation/手工验收执行脚本-非听写语音统一主链-ADR0027-2026-04-26.md)
- 执行记录模板：[`手工验收执行记录-非听写语音统一主链-ADR0027-2026-04-26.md`](../archive/manual-validation/手工验收执行记录-非听写语音统一主链-ADR0027-2026-04-26.md)

## 建议观测指标

| 指标 | 说明 |
|------|------|
| 语音请求成功率 | STT final 至完成路由且无错误提示的比例 |
| 首包 / 端到端时延 | 与同模型配置下的文字输入对比 |
| destructive 确认率 / 误触发率 | `pendingConfirm` vs 已执行破坏性 action |
| 用户重试率 | 短间隔内同 mode 连续 final |
| 模式切换频次 | command ↔ analysis ↔ dictation |
| 听写写入失败率 | `handleVoiceDictation` 校验拒绝或持久化失败 |

## 客户端数据

`userBehaviorDB.actionRecords` 每条含 **`inputModality`**：`voice`（语音代理执行的动作）或 `text`（转写页 `useKeybindingActions` 全局/波形快捷键；`sessionId` 常为 `transcription:text-input`）。

## 发布记录

- 版本 / 环境：`d77a232` / 本地开发环境（Darwin, Node + Vitest）
- 验证窗口：2026-04-28 19:50~19:52（UTC+8）
- 结论：go（代码与自动化门禁通过，可继续推进）
- 跟进项：
  - 预发环境按手工脚本补跑 CASE 01~06，并将截图/录屏证据回填执行记录。
  - 发布后按本页观测指标跟踪首周数据，重点关注 destructive 确认率与误触发率。

## QA 抽检用例（摘要）

1. dictation：口述中含「删除」等词仅写入，不触发删除 action。
2. command / analysis：未命中规则的长请求进入 AI 聊天；工具确认与文字一致。
3. 播放 / 暂停 / 上下句：不经 LLM，低时延 `executeAction`。
