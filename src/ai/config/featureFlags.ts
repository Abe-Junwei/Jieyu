
// 系统功能开关 | System feature flags
export const featureFlags = {
  aiChatEnabled: true,
  voiceAgentEnabled: true,
  /** 分层边界 v2 开关（独立切分） | Layer boundary v2 toggle (independent segmentation) */
  segmentBoundaryV2Enabled: false,
  /** AI 聊天灰度模式开关 | AI chat gray mode toggle */
  aiChatGrayMode: false,
  /** AI 聊天回滚模式开关 | AI chat rollback mode toggle */
  aiChatRollbackMode: false,
} as const;

export type FeatureFlags = typeof featureFlags;
