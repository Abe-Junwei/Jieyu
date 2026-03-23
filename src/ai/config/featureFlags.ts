
// 系统功能开关 | System feature flags
export const featureFlags = {
  aiChatEnabled: true,
  voiceAgentEnabled: true,
  /** AI 聊天灰度模式开关 | AI chat gray mode toggle */
  aiChatGrayMode: false,
  /** AI 聊天回滚模式开关 | AI chat rollback mode toggle */
  aiChatRollbackMode: false,
} as const;

export type FeatureFlags = typeof featureFlags;
