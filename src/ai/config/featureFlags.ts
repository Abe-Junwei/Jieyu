export const featureFlags = {
  aiChatEnabled: true,
  voiceAgentEnabled: true,
} as const;

export type FeatureFlags = typeof featureFlags;
