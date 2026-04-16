
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
} as const;

export type FeatureFlags = typeof featureFlags;
