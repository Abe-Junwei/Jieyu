import { t, type Locale } from '../../i18n';
import type { AiChatSettings } from '../../ai/providers/providerCatalog';

type ProviderField = {
  key: keyof AiChatSettings;
  label: string;
  type: 'text' | 'password' | 'number' | 'select';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};

export function AiChatProviderConfigPanel({
  aiChatSettings,
  activeProviderFields,
  onUpdateAiChatSettings,
  updateCostGuardSetting,
  cardMessages,
  locale,
  onTestAiConnection,
  isTestingConnection,
  setTestConnectionPending,
  aiConnectionTestStatus,
  aiConnectionTestMessage,
  hasApiKeyField,
  webllmWarmupState,
  handleWarmupWebllmModel,
  handleCancelWebllmWarmup,
  webllmRuntimeStatus,
  webllmSourceLabel,
  webllmFallbackLabel,
  webllmWarmupPercent,
  webllmWarmupPhaseLabel,
  webllmWarmupMessage,
}: {
  aiChatSettings: AiChatSettings;
  activeProviderFields: ProviderField[];
  onUpdateAiChatSettings: ((patch: Partial<AiChatSettings>) => void) | undefined;
  updateCostGuardSetting: (key: 'sessionTokenBudget' | 'outputTokenCap' | 'outputTokenRetryCap', rawValue: string) => void;
  cardMessages: {
    costGuardSessionTokenBudgetLabel: string;
    costGuardOutputTokenCapLabel: string;
    costGuardOutputTokenRetryCapLabel: string;
    webllmWarmingUp: string;
    webllmWarmup: string;
    webllmWarmupCancel: string;
    clearCurrentKey: string;
    webllmRuntimeTitle: string;
    webllmRuntimeSource: string;
    webllmRuntimeDetail: string;
    webllmRuntimeRoute: string;
    webllmWarmupProgressLabel: string;
  };
  locale: Locale;
  onTestAiConnection: (() => Promise<void> | void) | undefined;
  isTestingConnection: boolean;
  setTestConnectionPending: (next: boolean) => void;
  aiConnectionTestStatus: 'idle' | 'testing' | 'success' | 'error';
  aiConnectionTestMessage: string | null | undefined;
  hasApiKeyField: boolean;
  webllmWarmupState: 'idle' | 'running' | 'success' | 'error';
  handleWarmupWebllmModel: () => Promise<void>;
  handleCancelWebllmWarmup: () => void;
  webllmRuntimeStatus: { available: boolean; detail: string };
  webllmSourceLabel: string;
  webllmFallbackLabel: string;
  webllmWarmupPercent: number;
  webllmWarmupPhaseLabel: string | null;
  webllmWarmupMessage: string | null;
}) {
  return (
    <form
      className="ai-chat-provider-config-panel"
      onSubmit={(event) => event.preventDefault()}
    >
      {activeProviderFields.map((field) => (
        <div key={field.key} className="ai-chat-provider-config-row">
          <span className="ai-cfg-label">{field.label}</span>
          {field.type === 'select' ? (
            <select
              className="ai-cfg-input"
              value={String(aiChatSettings[field.key] ?? '')}
              onChange={(e) => onUpdateAiChatSettings?.({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
            >
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              className="ai-cfg-input"
              type={field.type}
              value={String(aiChatSettings[field.key] ?? '')}
              placeholder={field.placeholder}
              onChange={(e) => onUpdateAiChatSettings?.({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
            />
          )}
        </div>
      ))}
      <div className="ai-chat-provider-config-row">
        <span className="ai-cfg-label">{cardMessages.costGuardSessionTokenBudgetLabel}</span>
        <input
          className="ai-cfg-input"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          aria-label={cardMessages.costGuardSessionTokenBudgetLabel}
          value={String(aiChatSettings.sessionTokenBudget ?? '')}
          onChange={(e) => updateCostGuardSetting('sessionTokenBudget', e.currentTarget.value)}
        />
      </div>
      <div className="ai-chat-provider-config-row">
        <span className="ai-cfg-label">{cardMessages.costGuardOutputTokenCapLabel}</span>
        <input
          className="ai-cfg-input"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          aria-label={cardMessages.costGuardOutputTokenCapLabel}
          value={String(aiChatSettings.outputTokenCap ?? '')}
          onChange={(e) => updateCostGuardSetting('outputTokenCap', e.currentTarget.value)}
        />
      </div>
      <div className="ai-chat-provider-config-row">
        <span className="ai-cfg-label">{cardMessages.costGuardOutputTokenRetryCapLabel}</span>
        <input
          className="ai-cfg-input"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          aria-label={cardMessages.costGuardOutputTokenRetryCapLabel}
          value={String(aiChatSettings.outputTokenRetryCap ?? '')}
          onChange={(e) => updateCostGuardSetting('outputTokenRetryCap', e.currentTarget.value)}
        />
      </div>
      <div className="ai-chat-provider-config-actions">
        <button
          type="button"
          className={`icon-btn ai-chat-provider-config-action-btn${aiConnectionTestStatus === 'success' ? ' ai-conn-ok' : ''}`}
          disabled={!onTestAiConnection || isTestingConnection}
          onClick={() => {
            if (!onTestAiConnection) return;
            setTestConnectionPending(true);
            void Promise.resolve(onTestAiConnection()).finally(() => {
              setTestConnectionPending(false);
            });
          }}
        >
          {isTestingConnection
            ? t(locale, 'ai.chat.testing')
            : t(locale, 'ai.chat.testConnection')}
        </button>
        {aiChatSettings.providerKind === 'webllm' && (
          <button
            type="button"
            className={`icon-btn ai-chat-provider-config-action-btn${webllmWarmupState === 'success' ? ' ai-conn-ok' : ''}`}
            disabled={webllmWarmupState === 'running'}
            onClick={() => {
              void handleWarmupWebllmModel();
            }}
          >
            {webllmWarmupState === 'running'
              ? cardMessages.webllmWarmingUp
              : cardMessages.webllmWarmup}
          </button>
        )}
        {aiChatSettings.providerKind === 'webllm' && webllmWarmupState === 'running' && (
          <button
            type="button"
            className="icon-btn ai-chat-provider-config-action-btn ai-chat-provider-config-action-btn-cancel"
            onClick={handleCancelWebllmWarmup}
          >
            {cardMessages.webllmWarmupCancel}
          </button>
        )}
        {hasApiKeyField && (
          <button
            type="button"
            className="icon-btn ai-chat-provider-config-action-btn ai-chat-provider-config-action-btn-clear-key"
            onClick={() => onUpdateAiChatSettings?.({ apiKey: '' })}
          >
            {cardMessages.clearCurrentKey}
          </button>
        )}
      </div>
      {aiConnectionTestStatus === 'error' && aiConnectionTestMessage && (
        <p className="ai-conn-error-msg">{aiConnectionTestMessage}</p>
      )}
      {aiChatSettings.providerKind === 'webllm' && (
        <div className={`ai-webllm-runtime-card ${webllmRuntimeStatus.available ? 'is-available' : 'is-unavailable'}`}>
          <p className="ai-webllm-runtime-title">{cardMessages.webllmRuntimeTitle}</p>
          <p className="ai-webllm-runtime-line"><span>{cardMessages.webllmRuntimeSource}:</span> <strong>{webllmSourceLabel}</strong></p>
          <p className="ai-webllm-runtime-line"><span>{cardMessages.webllmRuntimeDetail}:</span> {webllmRuntimeStatus.detail}</p>
          <p className="ai-webllm-runtime-line"><span>{cardMessages.webllmRuntimeRoute}:</span> {webllmFallbackLabel}</p>
          {(webllmWarmupState === 'running' || webllmWarmupState === 'success') && (
            <div className="ai-webllm-progress" role="status" aria-live="polite">
              <p className="ai-webllm-runtime-line"><span>{cardMessages.webllmWarmupProgressLabel}:</span> {webllmWarmupPercent}%</p>
              <div className="ai-webllm-progress-track">
                <progress className="ai-webllm-progress-bar" value={webllmWarmupPercent} max={100}>
                  {webllmWarmupPercent}%
                </progress>
              </div>
              {webllmWarmupPhaseLabel && (
                <p className="ai-webllm-runtime-line ai-webllm-progress-detail">{webllmWarmupPhaseLabel}</p>
              )}
            </div>
          )}
          {webllmWarmupMessage && (
            <p className={`ai-webllm-runtime-message ${
              webllmWarmupState === 'error'
                ? 'is-error'
                : webllmWarmupState === 'success'
                  ? 'is-success'
                  : 'is-info'
            }`}>
              {webllmWarmupMessage}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
