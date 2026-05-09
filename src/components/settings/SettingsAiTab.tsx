import { useState, useEffect, useCallback, useMemo } from 'react';
import { OptionGroup, SettingRow, SettingsSection } from '../settingsModalPrimitives';
import {
  aiChatProviderDefinitions,
  normalizeAiChatSettings,
  type AiChatSettings,
  type AiChatProviderKind,
} from '../../ai/providers/providerCatalog';
import {
  loadAiChatSettingsFromStorage,
  persistAiChatSettings,
} from '../../ai/config/aiChatSettingsStorage';
import {
  loadEmbeddingProviderConfig,
  saveEmbeddingProviderConfig,
  type EmbeddingProviderConfig,
} from '../../pages/TranscriptionPage.helpers';
import type { EmbeddingProviderKind } from '../../ai/embeddings/EmbeddingProvider';
import {
  persistAcousticProviderRuntimeConfig,
  resolveAcousticProviderRuntimeConfig,
  type AcousticProviderRoutingStrategy,
  type AcousticProviderRuntimeConfig,
} from '../../services/acoustic/acousticProviderContract';
import {
  VOICE_SETTINGS_UPDATED_EVENT,
  loadCommercialSttConfig,
  loadLocalWhisperConfig,
  loadSttEnhancementSelection,
  saveCommercialSttConfig,
  saveLocalWhisperConfig,
  saveSttEnhancementSelection,
  type CommercialProviderKind,
  type CommercialProviderConfig,
  type VoiceLocalWhisperConfig,
  type VoiceSttEnhancementConfig,
} from '../../hooks/useVoiceDock';
import {
  EMBEDDING_PROVIDER_OPTIONS,
  VOICE_COMMERCIAL_PROVIDER_OPTIONS,
  VOICE_ENHANCEMENT_OPTIONS,
  AI_CONTEXT_DEBUG_KEY,
} from './settingsConstants';
import { normalizeEmbeddingProviderConfig, readStoredBoolean } from './settingsHelpers';
import type { SettingsModalMessages } from '../../i18n/messages';
import type { Locale } from '../../i18n';

interface SettingsAiTabProps {
  locale: Locale;
  msg: SettingsModalMessages;
}

export function SettingsAiTab({ locale: _locale, msg }: SettingsAiTabProps) {
  const [aiSettings, setAiSettings] = useState<AiChatSettings | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaveFlash, setAiSaveFlash] = useState(false);

  useEffect(() => {
    if (aiSettings !== null) return;
    setAiLoading(true);
    void loadAiChatSettingsFromStorage().then((s) => {
      setAiSettings(s);
      setAiLoading(false);
    });
  }, [aiSettings]);

  const handleAiSettingsChange = (patch: Partial<AiChatSettings>) => {
    setAiSettings((prev) => {
      if (!prev) return prev;
      const next = normalizeAiChatSettings({ ...prev, ...patch });
      void persistAiChatSettings(next);
      setAiSaveFlash(true);
      setTimeout(() => setAiSaveFlash(false), 1500);
      return next;
    });
  };

  const activeAiProviderDef = useMemo(() => {
    const kind = aiSettings?.providerKind ?? 'mock';
    return aiChatProviderDefinitions.find((p) => p.kind === kind) ?? aiChatProviderDefinitions[0]!;
  }, [aiSettings?.providerKind]);

  const aiProviderGroups = useMemo(() => {
    const directKinds: AiChatProviderKind[] = [
      'deepseek',
      'qwen',
      'anthropic',
      'gemini',
      'ollama',
      'minimax',
    ];
    const compatKinds: AiChatProviderKind[] = ['openai-compatible'];
    const localKinds: AiChatProviderKind[] = ['mock', 'webllm', 'custom-http'];
    const byKind = new Map(aiChatProviderDefinitions.map((p) => [p.kind, p]));
    const pick = (kinds: AiChatProviderKind[]) =>
      kinds.map((k) => byKind.get(k)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const labels = { official: 'Official', compat: 'Compatible', local: 'Local / Custom' };
    return [
      { label: labels.official, items: pick(directKinds) },
      { label: labels.compat, items: pick(compatKinds) },
      { label: labels.local, items: pick(localKinds) },
    ].filter((g) => g.items.length > 0);
  }, []);

  const [embeddingProviderDefault, setEmbeddingProviderDefault] = useState<EmbeddingProviderConfig>(
    () => loadEmbeddingProviderConfig(),
  );
  const [acousticRuntimeDraft, setAcousticRuntimeDraft] = useState<AcousticProviderRuntimeConfig>(
    () => resolveAcousticProviderRuntimeConfig(),
  );
  const [voiceCommercialConfig, setVoiceCommercialConfig] = useState<{
    kind: CommercialProviderKind;
    config: CommercialProviderConfig;
  }>(() => loadCommercialSttConfig());
  const [voiceLocalWhisperConfig, setVoiceLocalWhisperConfig] = useState<VoiceLocalWhisperConfig>(
    () => loadLocalWhisperConfig(),
  );
  const [voiceEnhancementSelection, setVoiceEnhancementSelection] = useState<{
    kind: 'none' | 'whisperx-align' | 'mfa-align' | 'pyannote-diarize';
    config: VoiceSttEnhancementConfig;
  }>(() => {
    const loaded = loadSttEnhancementSelection();
    return {
      kind: loaded.kind as 'none' | 'whisperx-align' | 'mfa-align' | 'pyannote-diarize',
      config: loaded.config,
    };
  });
  const [acousticRuntimeSaved, setAcousticRuntimeSaved] = useState(false);
  const [acousticRuntimeError, setAcousticRuntimeError] = useState<string | null>(null);
  const [aiContextDebugEnabled, setAiContextDebugEnabled] = useState<boolean>(() =>
    readStoredBoolean(AI_CONTEXT_DEBUG_KEY, false),
  );

  const persistEmbeddingProviderDefault = (config: EmbeddingProviderConfig) => {
    const normalized = normalizeEmbeddingProviderConfig(config);
    setEmbeddingProviderDefault(normalized);
    saveEmbeddingProviderConfig(normalized);
  };

  const handleEmbeddingProviderKindChange = (kind: EmbeddingProviderKind) => {
    persistEmbeddingProviderDefault({ ...embeddingProviderDefault, kind });
  };

  const handleEmbeddingProviderBaseUrlChange = (value: string) => {
    persistEmbeddingProviderDefault({ ...embeddingProviderDefault, baseUrl: value });
  };

  const handleEmbeddingProviderApiKeyChange = (value: string) => {
    persistEmbeddingProviderDefault({ ...embeddingProviderDefault, apiKey: value });
  };

  const handleEmbeddingProviderModelChange = (value: string) => {
    persistEmbeddingProviderDefault({ ...embeddingProviderDefault, model: value });
  };

  const handleAcousticRuntimeRoutingChange = (mode: AcousticProviderRoutingStrategy) => {
    setAcousticRuntimeSaved(false);
    setAcousticRuntimeError(null);
    setAcousticRuntimeDraft((prev) => ({
      ...prev,
      routingStrategy: mode,
    }));
  };

  const handleAcousticRuntimeExternalEnabledChange = (enabled: boolean) => {
    setAcousticRuntimeSaved(false);
    setAcousticRuntimeError(null);
    setAcousticRuntimeDraft((prev) => ({
      ...prev,
      externalProvider: {
        ...prev.externalProvider,
        enabled,
      },
    }));
  };

  const handleAcousticRuntimeEndpointChange = (value: string) => {
    setAcousticRuntimeSaved(false);
    setAcousticRuntimeError(null);
    setAcousticRuntimeDraft((prev) => ({
      ...prev,
      externalProvider: {
        ...prev.externalProvider,
        endpoint: value,
      },
    }));
  };

  const handleAcousticRuntimeTimeoutChange = (value: number) => {
    const timeoutMs = Number.isFinite(value)
      ? Math.min(120000, Math.max(500, Math.round(value)))
      : 10000;
    setAcousticRuntimeSaved(false);
    setAcousticRuntimeError(null);
    setAcousticRuntimeDraft((prev) => ({
      ...prev,
      externalProvider: {
        ...prev.externalProvider,
        timeoutMs,
      },
    }));
  };

  const handleAcousticRuntimeSave = useCallback(() => {
    try {
      const persisted = persistAcousticProviderRuntimeConfig(acousticRuntimeDraft);
      setAcousticRuntimeDraft(persisted);
      setAcousticRuntimeSaved(true);
      setAcousticRuntimeError(null);
    } catch (error) {
      setAcousticRuntimeSaved(false);
      setAcousticRuntimeError(error instanceof Error ? error.message : String(error));
    }
  }, [acousticRuntimeDraft]);

  const handleAiContextDebugChange = (enabled: boolean) => {
    setAiContextDebugEnabled(enabled);
    try {
      localStorage.setItem(AI_CONTEXT_DEBUG_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  };

  const notifyVoiceSettingsUpdated = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(VOICE_SETTINGS_UPDATED_EVENT));
  }, []);

  const handleVoiceCommercialKindChange = useCallback(
    (kind: CommercialProviderKind) => {
      const next = { kind, config: voiceCommercialConfig.config };
      setVoiceCommercialConfig(next);
      saveCommercialSttConfig(next.kind, next.config);
      notifyVoiceSettingsUpdated();
    },
    [notifyVoiceSettingsUpdated, voiceCommercialConfig.config],
  );

  const handleVoiceCommercialConfigPatch = useCallback(
    (patch: Partial<CommercialProviderConfig>) => {
      setVoiceCommercialConfig((prev) => {
        const next = { kind: prev.kind, config: { ...prev.config, ...patch } };
        saveCommercialSttConfig(next.kind, next.config);
        notifyVoiceSettingsUpdated();
        return next;
      });
    },
    [notifyVoiceSettingsUpdated],
  );

  const handleVoiceLocalWhisperPatch = useCallback(
    (patch: Partial<VoiceLocalWhisperConfig>) => {
      setVoiceLocalWhisperConfig((prev) => {
        const next = { ...prev, ...patch };
        saveLocalWhisperConfig(next);
        notifyVoiceSettingsUpdated();
        return next;
      });
    },
    [notifyVoiceSettingsUpdated],
  );

  const handleVoiceEnhancementKindChange = useCallback(
    (kind: 'none' | 'whisperx-align' | 'mfa-align' | 'pyannote-diarize') => {
      setVoiceEnhancementSelection((prev) => {
        const next = { kind, config: prev.config };
        saveSttEnhancementSelection(next.kind, next.config);
        notifyVoiceSettingsUpdated();
        return next;
      });
    },
    [notifyVoiceSettingsUpdated],
  );

  const handleVoiceEnhancementConfigPatch = useCallback(
    (patch: Partial<VoiceSttEnhancementConfig>) => {
      setVoiceEnhancementSelection((prev) => {
        const next = { kind: prev.kind, config: { ...prev.config, ...patch } };
        saveSttEnhancementSelection(next.kind, next.config);
        notifyVoiceSettingsUpdated();
        return next;
      });
    },
    [notifyVoiceSettingsUpdated],
  );

  const toggleOptions = [
    { value: 'off' as const, label: msg.toggleOff },
    { value: 'on' as const, label: msg.toggleOn },
  ];

  const acousticRoutingOptions = [
    { value: 'local-first' as const, label: msg.aiAcousticRoutingLocalFirst },
    { value: 'prefer-external' as const, label: msg.aiAcousticRoutingPreferExternal },
  ];

  return (
    <>
      {aiLoading ? (
        <p className="settings-ai-loading">…</p>
      ) : aiSettings ? (
        <div className="settings-sections-stack">
          <SettingsSection
            title={msg.aiProviderLabel}
            className="settings-ai-provider-selector-section"
          >
            <div className="settings-inline-row">
              <select
                className="settings-select"
                value={aiSettings.providerKind}
                onChange={(e) =>
                  handleAiSettingsChange({
                    providerKind: e.currentTarget.value as AiChatProviderKind,
                  })
                }
              >
                {aiProviderGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.items.map((provider) => (
                      <option key={provider.kind} value={provider.kind}>
                        {provider.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {aiSaveFlash && <span className="settings-save-flash">{msg.aiSaved}</span>}
            </div>
          </SettingsSection>
          {activeAiProviderDef.fields.length > 0 && (
            <SettingsSection
              title={activeAiProviderDef.label}
              className="settings-ai-provider-fields-section"
            >
              {activeAiProviderDef.fields.map((field) => (
                <SettingRow key={field.key} label={field.label}>
                  {field.type === 'select' ? (
                    <select
                      className="settings-select"
                      value={String(aiSettings[field.key] ?? '')}
                      onChange={(e) =>
                        handleAiSettingsChange({
                          [field.key]: e.currentTarget.value,
                        } as Partial<AiChatSettings>)
                      }
                    >
                      {(field.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="settings-input"
                      type={field.type}
                      value={String(aiSettings[field.key] ?? '')}
                      placeholder={field.placeholder}
                      onChange={(e) =>
                        handleAiSettingsChange({
                          [field.key]: e.currentTarget.value,
                        } as Partial<AiChatSettings>)
                      }
                    />
                  )}
                </SettingRow>
              ))}
            </SettingsSection>
          )}
          <SettingsSection title={msg.aiEmbeddingDefaultsTitle}>
            <SettingRow label={msg.aiEmbeddingProviderLabel}>
              <OptionGroup
                value={embeddingProviderDefault.kind}
                options={EMBEDDING_PROVIDER_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={handleEmbeddingProviderKindChange}
              />
            </SettingRow>
            <SettingRow label={msg.aiEmbeddingModelLabel}>
              <input
                className="settings-input"
                value={embeddingProviderDefault.model ?? ''}
                placeholder={msg.aiEmbeddingModelPlaceholder}
                onChange={(e) => handleEmbeddingProviderModelChange(e.currentTarget.value)}
              />
            </SettingRow>
            <SettingRow label={msg.aiEmbeddingBaseUrlLabel}>
              <input
                className="settings-input"
                value={embeddingProviderDefault.baseUrl ?? ''}
                placeholder={msg.aiEmbeddingBaseUrlPlaceholder}
                onChange={(e) => handleEmbeddingProviderBaseUrlChange(e.currentTarget.value)}
              />
            </SettingRow>
            <SettingRow label={msg.aiEmbeddingApiKeyLabel}>
              <input
                className="settings-input"
                type="password"
                value={embeddingProviderDefault.apiKey ?? ''}
                placeholder={msg.aiEmbeddingApiKeyPlaceholder}
                onChange={(e) => handleEmbeddingProviderApiKeyChange(e.currentTarget.value)}
              />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title={msg.aiAcousticDefaultsTitle}>
            <SettingRow label={msg.aiAcousticRoutingLabel}>
              <OptionGroup
                value={acousticRuntimeDraft.routingStrategy}
                options={acousticRoutingOptions}
                onChange={handleAcousticRuntimeRoutingChange}
              />
            </SettingRow>
            <SettingRow label={msg.aiAcousticExternalEnabledLabel}>
              <OptionGroup
                value={acousticRuntimeDraft.externalProvider.enabled ? 'on' : 'off'}
                options={toggleOptions}
                onChange={(value) => handleAcousticRuntimeExternalEnabledChange(value === 'on')}
              />
            </SettingRow>
            <SettingRow label={msg.aiAcousticEndpointLabel}>
              <input
                className="settings-input"
                value={acousticRuntimeDraft.externalProvider.endpoint ?? ''}
                placeholder={msg.aiAcousticEndpointPlaceholder}
                onChange={(e) => handleAcousticRuntimeEndpointChange(e.currentTarget.value)}
              />
            </SettingRow>
            <SettingRow label={msg.aiAcousticTimeoutLabel}>
              <div className="settings-inline-row">
                <input
                  type="number"
                  className="settings-input"
                  min={500}
                  max={120000}
                  step={100}
                  value={acousticRuntimeDraft.externalProvider.timeoutMs}
                  onChange={(e) =>
                    handleAcousticRuntimeTimeoutChange(Number(e.currentTarget.value))
                  }
                />
                <span className="settings-range-value">ms</span>
              </div>
            </SettingRow>
            <div className="settings-inline-row">
              <button
                type="button"
                className="settings-link-btn"
                onClick={handleAcousticRuntimeSave}
              >
                {msg.aiAcousticSaveButton}
              </button>
              {acousticRuntimeSaved ? (
                <span className="settings-save-flash">{msg.aiSaved}</span>
              ) : null}
            </div>
            {acousticRuntimeError ? (
              <p className="settings-ai-note">{acousticRuntimeError}</p>
            ) : null}
          </SettingsSection>

          <SettingsSection title={msg.aiVoiceDefaultsTitle}>
            <SettingRow label={msg.aiVoiceCommercialProviderLabel}>
              <select
                className="settings-select"
                value={voiceCommercialConfig.kind}
                onChange={(e) =>
                  handleVoiceCommercialKindChange(e.currentTarget.value as CommercialProviderKind)
                }
              >
                {VOICE_COMMERCIAL_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label={msg.aiVoiceApiKeyLabel}>
              <input
                className="settings-input"
                type="password"
                value={voiceCommercialConfig.config.apiKey ?? ''}
                placeholder={msg.aiVoiceApiKeyPlaceholder}
                onChange={(e) =>
                  handleVoiceCommercialConfigPatch({ apiKey: e.currentTarget.value })
                }
              />
            </SettingRow>
            <SettingRow label={msg.aiVoiceBaseUrlLabel}>
              <input
                className="settings-input"
                value={voiceCommercialConfig.config.baseUrl ?? ''}
                placeholder={msg.aiVoiceBaseUrlPlaceholder}
                onChange={(e) =>
                  handleVoiceCommercialConfigPatch({ baseUrl: e.currentTarget.value })
                }
              />
            </SettingRow>
            <SettingRow label={msg.aiVoiceModelLabel}>
              <input
                className="settings-input"
                value={voiceCommercialConfig.config.model ?? ''}
                placeholder={msg.aiVoiceModelPlaceholder}
                onChange={(e) => handleVoiceCommercialConfigPatch({ model: e.currentTarget.value })}
              />
            </SettingRow>
            <SettingRow label={msg.aiVoiceAppIdLabel}>
              <input
                className="settings-input"
                value={voiceCommercialConfig.config.appId ?? ''}
                onChange={(e) => handleVoiceCommercialConfigPatch({ appId: e.currentTarget.value })}
              />
            </SettingRow>
            <SettingRow label={msg.aiVoiceAccessTokenLabel}>
              <input
                className="settings-input"
                type="password"
                value={voiceCommercialConfig.config.accessToken ?? ''}
                onChange={(e) =>
                  handleVoiceCommercialConfigPatch({ accessToken: e.currentTarget.value })
                }
              />
            </SettingRow>
            <SettingRow label={msg.aiVoiceWhisperBaseUrlLabel}>
              <input
                className="settings-input"
                value={voiceLocalWhisperConfig.baseUrl ?? ''}
                onChange={(e) => handleVoiceLocalWhisperPatch({ baseUrl: e.currentTarget.value })}
              />
            </SettingRow>
            <SettingRow label={msg.aiVoiceWhisperModelLabel}>
              <input
                className="settings-input"
                value={voiceLocalWhisperConfig.model ?? ''}
                onChange={(e) => handleVoiceLocalWhisperPatch({ model: e.currentTarget.value })}
              />
            </SettingRow>
            <SettingRow label={msg.aiVoiceEnhancementKindLabel}>
              <select
                className="settings-select"
                value={voiceEnhancementSelection.kind}
                onChange={(e) =>
                  handleVoiceEnhancementKindChange(
                    e.currentTarget.value as
                      | 'none'
                      | 'whisperx-align'
                      | 'mfa-align'
                      | 'pyannote-diarize',
                  )
                }
              >
                {VOICE_ENHANCEMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label={msg.aiVoiceEnhancementEndpointLabel}>
              <input
                className="settings-input"
                value={voiceEnhancementSelection.config.endpointUrl ?? ''}
                onChange={(e) =>
                  handleVoiceEnhancementConfigPatch({ endpointUrl: e.currentTarget.value })
                }
              />
            </SettingRow>
            <SettingRow label={msg.aiVoiceEnhancementModelLabel}>
              <input
                className="settings-input"
                value={voiceEnhancementSelection.config.model ?? ''}
                onChange={(e) =>
                  handleVoiceEnhancementConfigPatch({ model: e.currentTarget.value })
                }
              />
            </SettingRow>
            <SettingRow label={msg.aiVoiceEnhancementLanguageLabel}>
              <input
                className="settings-input"
                value={voiceEnhancementSelection.config.language ?? ''}
                onChange={(e) =>
                  handleVoiceEnhancementConfigPatch({ language: e.currentTarget.value })
                }
              />
            </SettingRow>
            <p className="settings-ai-note">{msg.aiVoiceApplyHint}</p>
          </SettingsSection>

          {import.meta.env.DEV ? (
            <SettingsSection title={msg.aiDebugTitle}>
              <SettingRow label={msg.aiDebugContextLabel}>
                <OptionGroup
                  value={aiContextDebugEnabled ? 'on' : 'off'}
                  options={toggleOptions}
                  onChange={(value) => handleAiContextDebugChange(value === 'on')}
                />
              </SettingRow>
            </SettingsSection>
          ) : null}

          <p className="settings-ai-note">{msg.aiConfigNote}</p>
        </div>
      ) : null}
    </>
  );
}
