export const featureFlags = {
  aiChatEnabled: true,
} as const;

export type FeatureFlags = typeof featureFlags;
