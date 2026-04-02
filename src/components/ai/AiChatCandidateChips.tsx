import { getAiChatCandidateChipsMessages } from '../../i18n/aiChatCandidateChipsMessages';

interface CandidateItem {
  key: string;
  label: string;
}

interface AiChatCandidateChipsProps {
  isZh: boolean;
  aiIsStreaming: boolean;
  debugUiShowAll: boolean;
  candidates: CandidateItem[];
  onSendAiMessage?: ((message: string) => Promise<void>) | undefined;
}

export function AiChatCandidateChips({
  isZh,
  aiIsStreaming,
  debugUiShowAll,
  candidates,
  onSendAiMessage,
}: AiChatCandidateChipsProps) {
  const messages = getAiChatCandidateChipsMessages(isZh);
  const fallbackCandidates: CandidateItem[] = [
    { key: 'demo-1', label: messages.demoCandidate1 },
    { key: 'demo-2', label: messages.demoCandidate2 },
  ];

  const displayCandidates = candidates.length > 0 ? candidates : fallbackCandidates;

  return (
    <div className="ai-chat-candidate-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0', flexShrink: 0 }}>
      {displayCandidates.map((candidate) => (
        <button
          key={candidate.key}
          type="button"
          className="icon-btn ai-chat-candidate-chip"
          style={{ height: 'calc(26px * var(--ui-font-scale, 1))', fontSize: 'calc(11px * var(--ui-font-scale, 1))', padding: '0 calc(10px * var(--ui-font-scale, 1))', borderRadius: 13 }}
          disabled={!onSendAiMessage || aiIsStreaming || debugUiShowAll}
          onClick={() => {
            if (debugUiShowAll) return;
            void onSendAiMessage?.(candidate.label);
          }}
        >
          {candidate.label}
        </button>
      ))}
    </div>
  );
}
