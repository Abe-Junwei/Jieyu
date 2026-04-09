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
    <div className="ai-chat-candidate-chips">
      {displayCandidates.map((candidate) => (
        <button
          key={candidate.key}
          type="button"
          className="icon-btn ai-chat-candidate-chip"
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
