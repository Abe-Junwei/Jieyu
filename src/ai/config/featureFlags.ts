
// 系统功能开关 | System feature flags
export const featureFlags = {
  aiChatEnabled: true,
  voiceAgentEnabled: true,
  /** 单主轴模式：所有时间编辑统一作用于 unit 主轴 | Single-axis mode: all timing edits target the unit axis */
  singleAxisUnitMode: true,
  /** AI 聊天灰度模式开关 | AI chat gray mode toggle */
  aiChatGrayMode: false,
  /** AI 聊天回滚模式开关 | AI chat rollback mode toggle */
  aiChatRollbackMode: false,
  /** AI 多步推理循环开关 | AI multi-step agent loop toggle */
  aiChatAgentLoopEnabled: true,
  /** 转写 AI 是否在构造 system 上下文前做 RAG 检索 | Whether transcription AI runs embedding RAG before system context */
  aiChatRagEnabled: true,
  /** C 阶段：记录 memory/RAG 召回形态证据 | C-stage: emit memory/RAG recall shape evidence */
  aiMemoryRecallShapeTelemetryEnabled: true,
  /** C 阶段：统一记忆召回 broker（dogfood 已启用）| C-stage unified memory broker (dogfood enabled) */
  aiMemoryBrokerEnabled: true,
  /** C 阶段：意图多候选与置信门控（dogfood 已启用）| C-stage intent confidence gate (dogfood enabled) */
  aiIntentConfidenceGateEnabled: true,
  /** C 阶段：后台任务工具沙箱（默认关闭，尚未接入运行时）| C-stage background task sandbox (off; no runtime wiring yet) */
  aiBackgroundToolSandboxEnabled: false,
  /** C 阶段：后台记忆抽取（dogfood 已启用）| C-stage background memory extractor (dogfood enabled) */
  aiBackgroundMemoryExtractorEnabled: true,
  /** C 阶段：扩展信任、配额与健康度治理（dogfood 已启用）| C-stage extension trust governance (dogfood enabled) */
  aiExtensionTrustGovernanceEnabled: true,
  /** C 阶段：语音 provider manifest（dogfood 已启用）| C-stage voice provider manifest (dogfood enabled) */
  aiVoiceProviderManifestEnabled: true,
  /** C 阶段：轻量协调协议（dogfood 已启用，audit-only）| C-stage coordination lite (dogfood enabled, audit-only) */
  aiCoordinationLiteEnabled: true,
  /** 语料库实验室壳开关 | Corpus library lab shell toggle */
  corpusLibraryLabEnabled: false,
} as const;

export type FeatureFlags = typeof featureFlags;
