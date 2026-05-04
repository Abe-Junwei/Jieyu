---
title: 手工验收执行记录：F4 session sidecar 阻断审计（2026-05-05）
doc_type: manual-validation-record
status: draft
owner: ai-runtime
last_reviewed: 2026-05-05
source_of_truth: manual-validation
---

# 手工验收执行记录：F4 session sidecar 阻断审计（2026-05-05）

> 对应脚本：[手工验收执行脚本-F4-session-sidecar-sandbox-audit-2026-05-05.md](./手工验收执行脚本-F4-session-sidecar-sandbox-audit-2026-05-05.md)
>
> **说明**：本页为执行留痕模板。自动化基线（Vitest + E2E 壳烟测）由代理在 2026-05-05 已跑通；**Dexie 手工抽查**请在真实 dogfood 环境由执行人补填下列表格后改 `status: active` 或归档。

## 执行摘要

| 项 | 内容 |
| --- | --- |
| 执行人 | CI / 代理自动化基线 |
| 执行时间 | 2026-05-05 |
| 构建 / 入口 | `playwright.config.ts`：`npm run preview` + `http://localhost:4173` |
| 沙箱开关 | Dexie 手工用例仍待填；自动化未强制开启沙箱 |

## 用例结果

| 用例 | 结果 | 证据文件 / 备注 |
| --- | --- | --- |
| A send-preflight 审计行 | **通过（自动化）** | `npm run test:e2e:session-sidecar-audit`（`aiSessionSidecarSandboxAudit.spec.ts` 首条用例） |
| B 置顶 directive 审计行 | **通过（自动化）** | 同上 spec 第二条：`pinned user directive block…` |

## 自动化基线（代理执行留痕）

- `npx vitest run`（定向文件见脚本 §「自动化基线」）：在合并前应以 CI / 本地终端输出为准。
- `npm run test:e2e:chromium -- tests/e2e/aiChatSendTurnSmoke.spec.ts`：**2026-05-05 本地通过**（1 passed；壳挂载烟测）。
- `npm run test:e2e:session-sidecar-audit`：**2026-05-05 本地通过**（1 passed；Dexie `ai_session_sidecar_sandbox` + `gate` 含 `send-preflight`）。
