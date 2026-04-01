import { buildAiToolGoldenSnapshot, type AiToolGoldenSnapshot, type AiToolReplayBundle, type AiToolSnapshotDiff } from '../../ai/auditReplay';
import {
  compactInternalId,
  formatReplayableLabel,
  formatToolDecision,
  formatToolName,
} from './aiChatCardUtils';

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
  return (
    <div className="ai-chat-replay-panel">
      <div className="ai-chat-replay-panel-header">
        <strong className="ai-chat-replay-panel-title">{isZh ? '\u56de\u653e / \u5bf9\u6bd4' : 'Replay / Compare'}</strong>
        <div className="ai-chat-replay-panel-actions">
          <button type="button" className="icon-btn ai-chat-replay-panel-btn" onClick={onToggleDetail}>{showReplayDetailPanel ? (isZh ? '\u6536\u8d77\u8be6\u60c5' : 'Hide detail') : (isZh ? '\u5c55\u5f00\u8be6\u60c5' : 'Show detail')}</button>
          <button type="button" className="icon-btn ai-chat-replay-panel-btn" onClick={onClose}>{isZh ? '\u5173\u95ed' : 'Close'}</button>
        </div>
      </div>
      <div className="ai-chat-replay-panel-meta">
        <div>{isZh ? '\u5de5\u5177' : 'Tool'}: {formatToolName(isZh, selectedReplayBundle.toolName)}</div>
        <div>{isZh ? '\u8bf7\u6c42' : 'Request'}: {compactInternalId(selectedReplayBundle.requestId)}</div>
        <div>{isZh ? '\u72b6\u6001' : 'Status'}: {formatReplayableLabel(isZh, selectedReplayBundle.replayable)}</div>
        {selectedReplayBundle.latestDecision && (
          <div>{isZh ? '\u6700\u65b0\u51b3\u7b56' : 'Latest decision'}: {formatToolDecision(isZh, selectedReplayBundle.latestDecision.decision)}</div>
        )}
      </div>
      {showReplayDetailPanel && (
        <>
          {selectedReplayBundle.toolCall?.arguments && (
            <div className="ai-chat-replay-panel-section">
              <div className="ai-chat-replay-panel-section-title">{isZh ? '\u6267\u884c\u53c2\u6570' : 'Tool arguments'}</div>
              <pre className="ai-chat-replay-panel-code">{JSON.stringify(selectedReplayBundle.toolCall.arguments, null, 2)}</pre>
            </div>
          )}
          <div className="ai-chat-replay-panel-section">
            <div className="ai-chat-replay-panel-section-title">{isZh ? '\u51b3\u7b56\u8f68\u8ff9' : 'Decision timeline'}</div>
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
            <div className="ai-chat-replay-panel-section-title">{isZh ? 'Golden \u5feb\u7167\u9884\u89c8' : 'Golden Snapshot Preview'}</div>
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
              {isZh ? '\u5bfc\u5165\u5feb\u7167\u5bf9\u6bd4' : 'Import & Compare'}
            </button>
            {compareSnapshot && (
              <button
                type="button"
                className="icon-btn ai-chat-replay-panel-btn ai-chat-replay-panel-btn-compact"
                onClick={onClearCompare}
              >
                {isZh ? '\u6e05\u9664\u5bf9\u6bd4' : 'Clear diff'}
              </button>
            )}
          </div>
          {snapshotDiff && compareSnapshot && (
            <div className="ai-chat-replay-panel-section">
              <div className="ai-chat-replay-panel-diff-header">
                <div className="ai-chat-replay-panel-section-title">{isZh ? '\u5feb\u7167\u5bf9\u6bd4' : 'Snapshot Diff'}</div>
                <span className={`ai-chat-replay-panel-diff-badge ${snapshotDiff.matches ? 'is-match' : 'is-changed'}`}>
                  {snapshotDiff.matches ? (isZh ? '✓ \u4e00\u81f4' : '✓ Matches') : (isZh ? '△ \u6709\u5dee\u5f02' : '△ Changed')}
                </span>
              </div>
              <div className="ai-chat-replay-panel-baseline">
                {isZh ? `\u57fa\u51c6: ${compactInternalId(compareSnapshot.requestId)}` : `Baseline: ${compactInternalId(compareSnapshot.requestId)}`}
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
