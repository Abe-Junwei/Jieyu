import type { CommercialProviderCreateConfig } from './index';
import type { CommercialProviderKind } from '../VoiceInputService';

export type CommercialSttRuntimeSnapshot = {
  kind: CommercialProviderKind;
  config: CommercialProviderCreateConfig;
};

let runtimeSnapshot: CommercialSttRuntimeSnapshot | null = null;

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCommercialConfig(config: CommercialProviderCreateConfig | undefined): CommercialProviderCreateConfig {
  if (!config) return {};
  const normalized: CommercialProviderCreateConfig = {};
  const apiKey = normalizeString(config.apiKey);
  const baseUrl = normalizeString(config.baseUrl);
  const model = normalizeString(config.model);
  const appId = normalizeString(config.appId);
  const accessToken = normalizeString(config.accessToken);

  if (apiKey) normalized.apiKey = apiKey;
  if (baseUrl) normalized.baseUrl = baseUrl;
  if (model) normalized.model = model;
  if (appId) normalized.appId = appId;
  if (accessToken) normalized.accessToken = accessToken;
  return normalized;
}

export function setCommercialSttRuntimeSnapshot(
  kind: CommercialProviderKind,
  config: CommercialProviderCreateConfig | undefined,
): void {
  runtimeSnapshot = {
    kind,
    config: normalizeCommercialConfig(config),
  };
}

export function getCommercialSttRuntimeSnapshot(): CommercialSttRuntimeSnapshot | null {
  return runtimeSnapshot;
}

export function resetCommercialSttRuntimeSnapshotForTests(): void {
  runtimeSnapshot = null;
}
