import { buildAiToolGoldenSnapshot, type AiToolGoldenSnapshot, type AiToolReplayBundle, type AiToolSnapshotDiff } from '../../ai/auditReplay';
import {
  compactInternalId,
  formatReplayableLabel,
  formatToolDecision,
  formatToolName,
} from './aiChatCardUtils';
import { getAiChatReplayDetailPanelMessages } from '../../i18n/aiChatReplayDetailPanelMessages';

interface AiChatReplayDetailPanelProps {
  isZh: boolean;
  selectedReplayBundle: AiToolReplayBundle;
  showReplayDetailPanel: boolean;
  compareSnapshot: AiToolGoldenSnapshot | null;
  snapshotDiff: AiToolSnapshotDiff | null;
  importFileInputRef: React.RefObject<HTMLInputElement | null>;
  onToggleDetail: () => void;
  onClose: () => void;
  onImportSnapshotFile: (file: File) => void;
  onClearCompare: () => void;
}

export function AiChatReplayDetailPanel({
  isZh,
  selectedReplayBundle,
  showReplayDetailPanel,
  compareSnapshot,
  snapshotDiff,
  importFileInputRef,
  onToggleDetail,
  onClose,
  onImportSnapshotFile,
  onClearCompare,
}: AiChatReplayDetailPanelProps) {
  const messages = getAiChatReplayDetailPanelMessages(isZh);

  return (
    <div className="ai-chat-replay-panel">
      <div className="ai-chat-replay-panel-header">
        <strong className="ai-chat-replay-panel-title">{messages.title}</strong>
        <div className="ai-chat-replay-panel-actions">
          <button type="button" className="icon-btn ai-chat-replay-panel-btn" onClick={onToggleDetail}>{showReplayDetailPanel ? messages.hideDetail : messages.showDetail}</button>
          <button type="button" className="icon-btn ai-chat-replay-panel-btn" onClick={onClose}>{messages.close}</button>
        </div>
      </div>
      <div className="ai-chat-replay-panel-meta">
        <div>{messages.tool}: {formatToolName(isZh, selectedReplayBundle.toolName)}</div>
        <div>{messages.request}: {compactInternalId(selectedReplayBundle.requestId)}</div>
        <div>{messages.status}: {formatReplayableLabel(isZh, selectedReplayBundle.replayable)}</div>
        {selectedReplayBundle.latestDecision && (
          <div>{messages.latestDecision}: {formatToolDecision(isZh, selectedReplayBundle.latestDecision.decision)}</div>
        )}
      </div>
      {showReplayDetailPanel && (
        <>
          {selectedReplayBundle.toolCall?.arguments && (
            <div className="ai-chat-replay-panel-section">
              <div className="ai-chat-replay-panel-section-title">{messages.toolArguments}</div>
              <pre className="ai-chat-replay-panel-code">{JSON.stringify(selectedReplayBundle.toolCall.arguments, null, 2)}</pre>
            </div>
          )}
          <div className="ai-chat-replay-panel-section">
            <div className="ai-chat-replay-panel-section-title">{messages.decisionTimeline}</div>
            <div className="ai-chat-replay-panel-timeline">
              {selectedReplayBundle.decisions.map((decision) => (
                <div key={`${decision.timestamp}-${decision.decision}`} className="ai-chat-replay-panel-timeline-row">
                  <span>{formatToolDecision(isZh, decision.decision)}{decision.reason ? ` · ${decision.reason}` : ''}</span>
                  <em>{new Date(decision.timestamp).toLocaleTimeString()}</em>
                </div>
              ))}
            </div>
          </div>
          <div className="ai-chat-replay-panel-section">
            <div className="ai-chat-replay-panel-section-title">{messages.goldenPreview}</div>
            <pre className="ai-chat-replay-panel-code ai-chat-replay-panel-code-scroll">{JSON.stringify(buildAiToolGoldenSnapshot(selectedReplayBundle), null, 2)}</pre>
          </div>
          <div className="ai-chat-replay-panel-toolbar">
            <input
              type="file"
              accept=".json"
              className="ai-chat-replay-panel-file-input"
              ref={importFileInputRef}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) onImportSnapshotFile(file);
                e.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              className="icon-btn ai-chat-replay-panel-btn ai-chat-replay-panel-btn-compact"
              onClick={() => importFileInputRef.current?.click()}
            >
              {messages.importAndCompare}
            </button>
            {compareSnapshot && (
              <button
                type="button"
                className="icon-btn ai-chat-replay-panel-btn ai-chat-replay-panel-btn-compact"
                onClick={onClearCompare}
              >
                {messages.clearDiff}
              </button>
            )}
          </div>
          {snapshotDiff && compareSnapshot && (
            <div className="ai-chat-replay-panel-section">
              <div className="ai-chat-replay-panel-diff-header">
                <div className="ai-chat-replay-panel-section-title">{messages.snapshotDiff}</div>
                <span className={`ai-chat-replay-panel-diff-badge ${snapshotDiff.matches ? 'is-match' : 'is-changed'}`}>
                  {snapshotDiff.matches ? messages.matches : messages.changed}
                </span>
              </div>
              <div className="ai-chat-replay-panel-baseline">
                {messages.baseline(compactInternalId(compareSnapshot.requestId))}
              </div>
              <div className="ai-chat-replay-panel-diff-list">
                {snapshotDiff.fields.map((field) => (
                  <div key={field.label} className="ai-chat-replay-panel-diff-row">
                    <span className="ai-chat-replay-panel-diff-label">{field.label}</span>
                    {field.changed
                      ? <span className="ai-chat-replay-panel-diff-value is-changed">{field.baseline} {'\u2192'} {field.live}</span>
                      : <span className="ai-chat-replay-panel-diff-value is-match">✓</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
