---
title: 语音智能体 Hook 路径与 VoiceAgentService 行为对照表
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-05-01
source_of_truth: current-state
depends_on:
  - ./voice-unified-chat-path.md
  - ../adr/0028-assistant-multimodal-orchestration-local-first.md
---

# 语音智能体 Hook 路径与 VoiceAgentService 行为对照表

## 用途

在 **ADR-0028** 完成「Service 生产路径退役」之前，转写侧语音以 **`useVoiceAgent` Hook 栈**为主、`VoiceAgentService` 仍保留可测实现。本表记录两条路径在**关键行为**上应对齐的观测点；**任何修改语音 STT 终局、意图解析、懒加载或 manifest 的 PR**，应核对相关行是否仍成立，必要时更新本表。

## 听写 pipeline STT（Hook / Service 同源）

| 行为 | 单一事实源 | 说明 |
|------|------------|------|
| 有 `SpeechAnnotationPipeline` 时的 interim + final | `tryConsumeSttThroughDictationPipeline`（`voiceAgentServiceDictationSttRoute.ts`） | Hook 经 `useVoiceAgentDictationPipeline`；`VoiceAgentService` 经 `_handleSttResult`。Phase B 起 **interim 亦进 pipeline**，与 Hook 对齐。 |
| 无 pipeline 时的 interim | `applyVoiceSttInterimIfNotFinal`（`voiceAgentSttSurface.ts`） | Service 路径补齐「非空 interim 清 error」与 Hook 一致。 |

## 懒加载运行时（必须同源）

| 资源 | 单一事实源模块 | Hook 入口 | Service 入口 |
|------|------------------|-----------|----------------|
| `VoiceInputService` | `src/services/voiceRuntimeLoaders.ts` → `loadVoiceInputRuntime` | `useVoiceAgent.runtime` 再导出 | `VoiceAgentService` 直接 import |
| `WakeWordDetector` | 同上 → `loadWakeWordRuntime` | 同上 | `VoiceAgentService` / `VoiceAgentService.wakeWord` |
| `stt` 包 | 同上 → `loadSttRuntime` | 同上 | `VoiceAgentService` / `VoiceAgentService.runtime` |
| `SttStrategyRouter` | 同上 → `loadSttStrategyRuntime` | 同上 | 同上 |
| `IntentRouter`（含缓存 promise） | `useVoiceAgent.runtime` → `loadIntentRouterRuntime` | 仅此路径 | `VoiceAgentService.commandBridge` 使用 **静态 import**（同模块，非懒加载） |

说明：`IntentRouter` 在 Service 的 `commandBridge` 内为静态依赖；Hook 为懒加载以减小首包。意图解析一致性由 `resolveVoiceIntent` + `voiceIntentResolution.serviceHookParity.test.ts` 契约覆盖。

## 运行时行为对照

| 主题 | Hook 路径主要挂点 | Service 路径主要挂点 | 对齐预期 |
|------|-------------------|------------------------|----------|
| 麦克风 start/stop 串行 | `useVoiceAgentTransportControls` + `useVoiceAgentStartController`（`exclusiveStartPromiseRef`） | `VoiceAgentService._exclusiveStartPromise` / `_runExclusiveStart` | 快速 toggle 不泄漏麦；见历史 CRITICAL-3 整改 |
| Final STT → 意图 | `useVoiceAgentResultHandler` → `resolveVoiceIntent` | `VoiceAgentService.sttResultDispatch` → `handleFinalSttResult`（`commandBridge`）→ 同一 `resolveVoiceIntent` | 同一 `VoiceIntentResolutionDeps` 语义 |
| Final STT → 分发 | 两路径均经 `runVoiceFinalSttAfterIntentResolution` → `dispatchResolvedVoiceIntent` | Service：`sttResultDispatch` → `handleFinalSttResult` → 同上 tail | 同一 tail；Hook 多 `updateDisambiguationOptions` |
| 非听写进聊天主链 | `sendToAiChatRef` → `useVoiceInteraction` | `onSendToAiChat` | ADR-0027 |
| `inputModality` | `'voice'` 传入 `dispatchResolvedVoiceIntent` | 同上 | 观测一致 |
| manifest / engine | `useVoiceAgentStartController` + provider controls | `VoiceAgentService` start / `buildVoiceAgentStartConfig` | 行为需人工或 E2E 回归；C3 release-stable 见 C 阶段方案 |

## 维护约定

1. **禁止**在 `VoiceAgentService.ts` 与 `useVoiceAgent.runtime.ts` 中再引入第二套 `import('./VoiceInputService')` 等 promise（须走 `voiceRuntimeLoaders.ts`）。
2. 变更 `resolveVoiceIntent` 或 `runVoiceFinalSttAfterIntentResolution` 时，跑：`npx vitest run src/hooks/voiceIntentResolution.serviceHookParity.test.ts`。
3. 全量语音回归：`npm run check:voice-agent-pre-merge`。
