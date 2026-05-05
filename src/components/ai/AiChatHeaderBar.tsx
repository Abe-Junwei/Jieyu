import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../../utils/jieyuMaterialIcon';
import type { AiChatSettings, AiToolFeedbackStyle } from '../../ai/providers/providerCatalog';

type ProviderGroup = {
  label: string;
  items: Array<{ kind: AiChatSettings['providerKind']; label: string }>;
};

export function AiChatHeaderBar({
  chatTitle,
  toolFeedbackStyleResolved,
  cardMessages,
  onUpdateAiChatSettings,
  providerStatusTone,
  providerStatusLabel,
  activeProviderLabel,
  aiChatSettings,
  providerGroups,
  showProviderConfigButton,
  showProviderConfig,
  onToggleProviderConfig,
}: {
  chatTitle: string;
  toolFeedbackStyleResolved: AiToolFeedbackStyle;
  cardMessages: {
    toolFeedbackStyle: string;
    detailed: string;
    concise: string;
    hideProviderConfig: string;
    openProviderConfig: string;
  };
  onUpdateAiChatSettings: ((patch: Partial<AiChatSettings>) => void) | undefined;
  providerStatusTone: 'error' | 'ok' | 'local' | 'idle';
  providerStatusLabel: string;
  activeProviderLabel: string;
  aiChatSettings: AiChatSettings | null | undefined;
  providerGroups: ProviderGroup[];
  showProviderConfigButton: boolean;
  showProviderConfig: boolean;
  onToggleProviderConfig: () => void;
}) {
  return (
    <div className="ai-chat-header">
      <div className="ai-chat-header-left">
        <div className="ai-chat-header-info">
          <div className="ai-chat-header-title-row">
            <span className="ai-chat-header-title">{chatTitle}</span>
          </div>
        </div>
        <div className="ai-chat-header-tools">
          <div className="transcription-ai-mode-switch" role="group" aria-label={cardMessages.toolFeedbackStyle}>
            <button
              type="button"
              className={`transcription-ai-mode-btn ${toolFeedbackStyleResolved === 'detailed' ? 'is-active' : ''}`}
              aria-pressed={toolFeedbackStyleResolved === 'detailed'}
              onClick={() => {
                if (toolFeedbackStyleResolved === 'detailed') return;
                onUpdateAiChatSettings?.({ toolFeedbackStyle: 'detailed' });
              }}
            >
              {cardMessages.detailed}
            </button>
            <button
              type="button"
              className={`transcription-ai-mode-btn ${toolFeedbackStyleResolved === 'concise' ? 'is-active' : ''}`}
              aria-pressed={toolFeedbackStyleResolved === 'concise'}
              onClick={() => {
                if (toolFeedbackStyleResolved === 'concise') return;
                onUpdateAiChatSettings?.({ toolFeedbackStyle: 'concise' });
              }}
            >
              {cardMessages.concise}
            </button>
          </div>
          <span
            className={`ai-chat-provider-status-dot ai-chat-provider-status-dot-${providerStatusTone} ai-chat-provider-status-dot-inline`}
            role="status"
            aria-label={providerStatusLabel}
            title={`${activeProviderLabel} · ${providerStatusLabel}`}
          />
          <select
            className="ai-chat-provider-select"
            value={aiChatSettings?.providerKind ?? 'mock'}
            onChange={(e) => onUpdateAiChatSettings?.({
              providerKind: e.currentTarget.value as AiChatSettings['providerKind'],
            })}
          >
            {providerGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((provider) => (
                  <option key={provider.kind} value={provider.kind}>{provider.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {showProviderConfigButton && (
            <button
              type="button"
              className="icon-btn ai-chat-header-config-btn"
              aria-label={showProviderConfig ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig}
              title={showProviderConfig ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig}
              onClick={onToggleProviderConfig}
            >
              <MaterialSymbol name="settings" className={JIEYU_MATERIAL_INLINE} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
