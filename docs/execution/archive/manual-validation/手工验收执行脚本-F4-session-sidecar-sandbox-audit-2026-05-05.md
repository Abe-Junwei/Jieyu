---
title: 手工验收执行脚本：F4 session sidecar 阻断审计（2026-05-05）
doc_type: manual-validation-script
status: active
owner: ai-runtime
last_reviewed: 2026-05-05
source_of_truth: manual-validation
---

# 手工验收执行脚本：F4 session sidecar 阻断审计（2026-05-05）

> 目的：在**真实浏览器**中验证「置顶 / send-preflight 用户指令」在沙箱 **非 allow** 时，IndexedDB `audit_logs` 出现 **`field = ai_session_sidecar_sandbox`** 行，且 `metadataJson` 可解析出 `gate`、`sandboxAction`、`sandboxReason`。
>
> 对应记录文件（可选）：`docs/execution/archive/manual-validation/手工验收执行记录-F4-session-sidecar-sandbox-audit-2026-05-05.md`（执行后按需新建并链回 PR）。

## 前置条件

1. 使用 **桌面 Chromium**（与 Dexie 开发工具习惯一致即可）。
2. 构建与本地预览任选其一：
   - `npm run build && npm run preview`（默认端口以终端输出为准），或
   - `npm run dev`（开发模式）。
3. 将 **`aiBackgroundToolSandboxEnabled`** 置为 **true**，且使用会使 session 侧车写路径被判 **readonly / deny** 的配置（与代码中 `AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE` 及 `sendPreflightSessionSidecarSandboxProfileOverride` 的测试语义一致；产品环境以你们实际 dogfood 开关为准）。若当前构建默认关闭沙箱，可仅在 **开发分支** 临时打开该 flag 做本脚本验收，**勿**在未评审的生产配置中强开。

## 自动化基线（建议先跑）

```bash
npm run typecheck
npx vitest run src/hooks/useAiChat.sessionSidecarAudit.test.ts src/hooks/useAiChat.sendTurnPreflight.test.ts src/hooks/useAiChat.directiveSessionControls.test.tsx
npm run test:e2e:chromium -- tests/e2e/aiChatSendTurnSmoke.spec.ts
```

## 用例 A：send-preflight 阻断后出现审计行

1. 打开转写页 `/transcription`，展开侧栏 AI 面板，聚焦 `data-testid="ai-chat-composer-input"`。
2. 在沙箱 **非 allow** 且已启用沙箱开关的前提下，发送一条 **含可抽取用户指令** 的文本（与 `useAiChat.sendTurnPreflight.test.ts` 中「请记住：所有回答用英文」同类即可）。
3. 打开 DevTools → **Application** → **IndexedDB** → 本项目数据库 → **`audit_logs`**（或你们引擎中等价存储名）。
4. 过滤 `field` 列或全文搜索 **`ai_session_sidecar_sandbox`**。
5. **期望**：至少一条新记录；`metadataJson` 解析后 `phase === 'session_sidecar_sandbox'`，`gate` 含 **`send-preflight-directive`**，`sandboxAction` / `sandboxReason` 与只读/拒绝策略一致。

## 用例 B：置顶带指令用户消息阻断后出现审计行

1. 同环境确保会话中有一条 **用户**消息，正文含可抽取指令（与 `useAiChat.messagePinning.test.ts` 用例一致即可）。
2. 触发 **置顶**（UI 路径以当前 `AiChatCard` / 线程行为为准）。
3. 再次在 **Application → IndexedDB → audit_logs** 中搜索 **`ai_session_sidecar_sandbox`**。
4. **期望**：新增行中 `gate` 含 **`pinned-message-directive`**（或等价虚拟路径片段），`documentId` 为当前 `conversationId`。

## 证据与回填

- 证据目录建议：`docs/execution/archive/manual-validation/evidence/f4-session-sidecar-audit-2026-05-05/`
- 截图或导出 JSON 片段（脱敏）附在执行记录中；PR 描述中链到本脚本与记录文件。

## 失败时排查

1. 确认沙箱开关与 profile：无阻断则不会产生本字段（属预期）。
2. 确认未清空 IndexedDB：验收前勿执行「清除站点数据」。
3. 对照 Vitest：`useAiChat.sendTurnPreflight.test.ts`、`useAiChat.directiveSessionControls.test.tsx` 是否仍绿。
