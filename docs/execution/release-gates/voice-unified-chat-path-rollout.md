---
title: 非听写语音统一聊天路径 — 发布验证与观测
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-04-26
source_of_truth: runbook
---

# 非听写语音统一聊天路径：验证与观测

关联：[voice-unified-chat-path.md](../../architecture/voice-unified-chat-path.md) · [ADR-0027](../../adr/0027-voice-unified-non-dictation-chat-path.md)

本链路**无环境开关**；发布前以构建版本与端到端验证为主，不设「一键关 FF 回滚」分支。

## 自动化回归（与 QA 摘要 1–3 对齐）

发布前建议跑 **语音合入快捷命令**（含 ActionId/i18n/LLM 列表契约 + 语音助手 Vitest）：

```bash
npm run check:voice-agent-pre-merge
```

可选加跑与语音结果处理直接相关的单测：

```bash
npx vitest run src/hooks/useVoiceAgentResultHandler.test.ts
```

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

## 发布记录（模板）

- 版本 / 环境：
- 验证窗口：
- 结论：go / no-go
- 跟进项：

## QA 抽检用例（摘要）

1. dictation：口述中含「删除」等词仅写入，不触发删除 action。
2. command / analysis：未命中规则的长请求进入 AI 聊天；工具确认与文字一致。
3. 播放 / 暂停 / 上下句：不经 LLM，低时延 `executeAction`。
