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
    <div style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, padding: '8px', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 11 }}>{isZh ? '回放 / 对比' : 'Replay / Compare'}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="icon-btn" style={{ height: 22, minWidth: 70, fontSize: 10 }} onClick={onToggleDetail}>{showReplayDetailPanel ? (isZh ? '收起详情' : 'Hide detail') : (isZh ? '展开详情' : 'Show detail')}</button>
          <button type="button" className="icon-btn" style={{ height: 22, minWidth: 44, fontSize: 10 }} onClick={onClose}>{isZh ? '关闭' : 'Close'}</button>
        </div>
      </div>
      <div style={{ fontSize: 10, display: 'grid', gap: 2 }}>
        <div>{isZh ? '工具' : 'Tool'}: {formatToolName(isZh, selectedReplayBundle.toolName)}</div>
        <div>{isZh ? '请求' : 'Request'}: {compactInternalId(selectedReplayBundle.requestId)}</div>
        <div>{isZh ? '状态' : 'Status'}: {formatReplayableLabel(isZh, selectedReplayBundle.replayable)}</div>
        {selectedReplayBundle.latestDecision && (
          <div>{isZh ? '最新决策' : 'Latest decision'}: {formatToolDecision(isZh, selectedReplayBundle.latestDecision.decision)}</div>
        )}
      </div>
      {showReplayDetailPanel && (
        <>
          {selectedReplayBundle.toolCall?.arguments && (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 600 }}>{isZh ? '执行参数' : 'Tool arguments'}</div>
              <pre style={{ margin: 0, padding: 6, fontSize: 10, lineHeight: 1.4, background: '#f8fafc', borderRadius: 4, overflowX: 'auto' }}>{JSON.stringify(selectedReplayBundle.toolCall.arguments, null, 2)}</pre>
            </div>
          )}
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600 }}>{isZh ? '决策轨迹' : 'Decision timeline'}</div>
            <div style={{ display: 'grid', gap: 3 }}>
              {selectedReplayBundle.decisions.map((decision) => (
                <div key={`${decision.timestamp}-${decision.decision}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10 }}>
                  <span>{formatToolDecision(isZh, decision.decision)}{decision.reason ? ` · ${decision.reason}` : ''}</span>
                  <em>{new Date(decision.timestamp).toLocaleTimeString()}</em>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600 }}>{isZh ? 'Golden 快照预览' : 'Golden Snapshot Preview'}</div>
            <pre style={{ margin: 0, padding: 6, fontSize: 10, lineHeight: 1.4, background: '#f8fafc', borderRadius: 4, overflowX: 'auto', maxHeight: 160, overflowY: 'auto' }}>{JSON.stringify(buildAiToolGoldenSnapshot(selectedReplayBundle), null, 2)}</pre>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              ref={importFileInputRef}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) onImportSnapshotFile(file);
                e.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              className="icon-btn"
              style={{ fontSize: 9, height: 18 }}
              onClick={() => importFileInputRef.current?.click()}
            >
              {isZh ? '导入快照对比' : 'Import & Compare'}
            </button>
            {compareSnapshot && (
              <button
                type="button"
                className="icon-btn"
                style={{ fontSize: 9, height: 18 }}
                onClick={onClearCompare}
              >
                {isZh ? '清除对比' : 'Clear diff'}
              </button>
            )}
          </div>
          {snapshotDiff && compareSnapshot && (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 600 }}>{isZh ? '快照对比' : 'Snapshot Diff'}</div>
                <span style={{ fontSize: 10, fontWeight: 600, color: snapshotDiff.matches ? '#16a34a' : '#d97706' }}>
                  {snapshotDiff.matches ? (isZh ? '✓ 一致' : '✓ Matches') : (isZh ? '△ 有差异' : '△ Changed')}
                </span>
              </div>
              <div style={{ fontSize: 9, opacity: 0.6 }}>
                {isZh ? `基准: ${compactInternalId(compareSnapshot.requestId)}` : `Baseline: ${compactInternalId(compareSnapshot.requestId)}`}
              </div>
              <div style={{ display: 'grid', gap: 2 }}>
                {snapshotDiff.fields.map((field) => (
                  <div key={field.label} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, fontSize: 9 }}>
                    <span style={{ fontFamily: 'monospace', color: '#64748b' }}>{field.label}</span>
                    {field.changed
                      ? <span style={{ color: '#b91c1c' }}>{field.baseline} {'\u2192'} {field.live}</span>
                      : <span style={{ color: '#16a34a' }}>✓</span>
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
