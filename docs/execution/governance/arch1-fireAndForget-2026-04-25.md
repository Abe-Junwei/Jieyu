# ARCH-1：`fireAndForget` 与异步错误可观测 — 工程收口说明

> **doc_type**：execution-governance  
> **对账**：`docs/remediation-plan-2026-04-24.md` §3.1、脚本 `scripts/check-fire-and-forget-governance.mjs`（`npm run check:fire-and-forget-governance`）  
> **last_updated**：2026-04-25

## 1. 结论

- **全库**强制 `Result` / `neverthrow`**不采纳**：维持 **显式 `asyncResultFromPromise` + 按需分支**，避免大规模机械重构与包体积/风格分裂。
- **治理已闭环**：所有运行时代码中的 `fireAndForget(` 调用须含 **`context`（`src/...:L<line>`）** 与显式 **`policy`（见下节三档）**；`user-visible` 失败经 **`FIRE_AND_FORGET_ERROR_EVENT`** 进入 Toast 链。各档默认 Sentry 行为见 `FireAndForgetOptions['reportToSentry']` 与 `src/utils/fireAndForget.ts` 注释；可 **`onError`** 完全自定义。
- **路径白名单**：`background` 与 `background-quiet` 在 **hooks / pages** 上与原 **background** 规则相同（`scripts/check-fire-and-forget-governance.mjs`），避免在不当层级滥用无 Toast 策略。

## 1.1 三档 `policy`（产品细分）

| `policy` | Toast | 日志 | 默认 Sentry | 典型场景 |
| --- | --- | --- | --- | --- |
| `user-visible` | 是 | `error` | 是 | 用户直接操作后果 |
| `background` | 否 | `error` | 是 | 需工程观测的后台写路径、卸载保存等 |
| `background-quiet` | 否 | `warn` | **否** | 高噪/非关键：语言列表刷新、延迟 linguistic 加载、撤消快照刷新、去抖存盘、语音坞语言探测等；单点要观测可设 `reportToSentry: true` |

## 2. 与原文整改目标的映射

| 原目标 | 落地方式 |
| --- | --- |
| 防静默失败 | `context` + `policy` + 日志 +（`user-visible`）全局事件 + Sentry（按档默认） |
| 可选 `Result` 化 | `AsyncResult` + `asyncResultFromPromise`（`src/utils/fireAndForget.ts`） |
| 模块分批审计 | 已完成：CI 守卫 + 现网调用点显式 `policy` |
| 纯后台不打扰用户 | `background` / `background-quiet` + 路径白名单；更细用 `onError` / `reportToSentry` |

## 3. 单测与可测性

- `src/utils/fireAndForget.test.ts`：行为契约（含 `onError` 短路、空 `context` 归一化等）。

## 4. 变更记录

| 日期 | 说明 |
| --- | --- |
| 2026-04-25 | 对账 **ARCH-1** 在 `未落地项汇总` 中关门；本文件首版。 |
| 2026-04-25 | 第三档 **`background-quiet`**（见 §1.1）+ 治理脚本 `background` 同权校验。 |
