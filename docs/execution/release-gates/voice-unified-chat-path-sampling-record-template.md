---
title: 非听写语音统一聊天路径 — 周期采样执行记录（模板）
doc_type: release-evidence-record
status: template
owner: repo
last_reviewed: 2026-05-05
source_of_truth: runbook
---

# 非听写语音统一聊天路径：周期采样执行记录（模板）

关联：[voice-unified-chat-path-rollout.md](./voice-unified-chat-path-rollout.md) · [voice-unified-chat-path.md](../../architecture/voice-unified-chat-path.md) · [ADR-0027](../../adr/0027-voice-unified-non-dictation-chat-path.md) · [ADR-0028](../../adr/0028-assistant-multimodal-orchestration-local-first.md) · [ADR-0029](../../adr/0029-assistant-tts-web-speech-policy.md)

## 1. 采样元数据

- 版本 / commit：`<填写>`
- 环境：`<dev|staging|prod-candidate>`
- 执行人：`<填写>`
- 执行时间窗口：`<YYYY-MM-DD HH:mm ~ HH:mm TZ>`
- 周期编号：`<第 N 个连续发布周期>`

## 2. 执行命令与结果

1. 语音维护快速 gate

```bash
npm run gate:voice-maintenance:quick
```

- 结果：`<pass|fail>`
- 关键输出：`<填写，失败时附 error 首屏>`

2. 语音相关 E2E 抽检

```bash
npm run test:e2e:chromium -- --grep "voice|dictation|assistant" --pass-with-no-tests
```

- 结果：`<pass|fail>`
- 关键输出：`<填写，失败时附 case 名与堆栈>`

## 3. Phase D2 断言清单

- [ ] manifest 可读且 provider metadata 可渲染（无空白 provider label）。
- [ ] 首选引擎不可用时，降级路径可达且错误提示可见。
- [ ] command / analysis 非听写路径继续走聊天主链（ADR-0027 一致）。
- [ ] 听写路径不误触发 destructive action，pending confirm 行为不回退。

## 4. 证据附件

### 4.1 失败场景证据（至少 1 份）

- 证据 1：`<截图/日志路径>`
- 说明：`<manifest 故障或 provider 降级场景描述>`

### 4.2 成功场景证据（至少 1 份）

- 证据 1：`<截图/日志路径>`
- 说明：`<降级后仍可完成语音链路的场景描述>`

## 5. release-stable 连续周期判定

- 本周期是否出现 P0 级 manifest / 降级故障：`<是|否>`
- 连续无 P0 周期累计：`<N>`
- 是否满足 release-stable 声明条件：`<是|否>`
- 判定备注：`<填写>`

## 6. 结论与后续动作

- 本次结论：`<go|hold|rollback-review>`
- 阻塞项：`<无|填写>`
- 后续动作：
  - `<动作 1>`
  - `<动作 2>`
