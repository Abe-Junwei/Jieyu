import { useMemo } from 'react';
import { buildAiToolGoldenSnapshot, type AiToolGoldenSnapshot, type AiToolReplayBundle, type AiToolSnapshotDiff } from '../../ai/auditReplay';
import { compactInternalId, formatReplayableLabel, formatToolDecision, formatToolName } from './aiChatCardUtils';
import { getAiChatReplayDetailPanelMessages } from '../../i18n/messages';
import { useLocale } from '../../i18n';
import { computeAdaptivePanelWidth } from '../../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { PanelButton, PanelChip } from '../ui';
import { PanelSection } from '../ui/PanelSection';
import { CheckIcon } from '../SvgIcons';
import { PanelSummary } from '../ui/PanelSummary';
import { EmbeddedPanelShell } from '../ui/EmbeddedPanelShell';

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
  const locale = useLocale();
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  
  const compactWidth = useMemo(() => computeAdaptivePanelWidth({
    baseWidth: 360,
    locale,
    direction: uiTextDirection,
    uiFontScale,
    density: 'compact',
    minWidth: 300,
    maxWidth: 620,
    ...(viewportWidth !== undefined ? { viewportWidth } : {}),
  }), [locale, uiTextDirection, uiFontScale, viewportWidth]);
  
  const wideWidth = useMemo(() => computeAdaptivePanelWidth({
    baseWidth: 760,
    locale,
    direction: uiTextDirection,
    uiFontScale,
    density: 'standard',
    minWidth: 520,
    maxWidth: 900,
    ...(viewportWidth !== undefined ? { viewportWidth } : {}),
  }), [locale, uiTextDirection, uiFontScale, viewportWidth]);
  
  const messages = getAiChatReplayDetailPanelMessages(isZh);
  const latestDecisionLabel = selectedReplayBundle.latestDecision
    ? formatToolDecision(isZh, selectedReplayBundle.latestDecision.decision)
    : null;

  return (
    <EmbeddedPanelShell
      className="ai-chat-replay-panel panel-design-match-content"
      bodyClassName="ai-chat-replay-panel-body"
      footerClassName="ai-chat-replay-panel-footer"
      dir={uiTextDirection}
      layoutStyle={{
        minWidth: `min(100%, ${compactWidth}px)`,
        maxWidth: `min(100%, ${wideWidth}px)`,
      }}
      title={messages.title}
      footer={(
        <div className="ai-chat-replay-panel-actions ai-chat-replay-panel-actions-footer">
          <PanelButton className="ai-chat-replay-panel-btn" onClick={onToggleDetail}>
            {showReplayDetailPanel ? messages.hideDetail : messages.showDetail}
          </PanelButton>
          <PanelButton className="ai-chat-replay-panel-btn" onClick={onClose}>{messages.close}</PanelButton>
        </div>
      )}
    >
      <PanelSummary
        className="ai-chat-replay-panel-summary"
        title={formatToolName(isZh, selectedReplayBundle.toolName)}
        description={`${messages.request}: ${compactInternalId(selectedReplayBundle.requestId)}`}
        meta={(
          <div className="panel-meta">
            <PanelChip variant={selectedReplayBundle.replayable ? 'success' : 'danger'}>
              {formatReplayableLabel(isZh, selectedReplayBundle.replayable)}
            </PanelChip>
            <PanelChip>{showReplayDetailPanel ? messages.hideDetail : messages.showDetail}</PanelChip>
          </div>
        )}
        supportingText={latestDecisionLabel ? `${messages.latestDecision}: ${latestDecisionLabel}` : undefined}
      />
      {showReplayDetailPanel && (
        <>
          {selectedReplayBundle.toolCall?.arguments && (
            <PanelSection className="ai-chat-replay-panel-section" title={messages.toolArguments} titleClassName="ai-chat-replay-panel-section-title">
              <pre className="ai-chat-replay-panel-code">{JSON.stringify(selectedReplayBundle.toolCall.arguments, null, 2)}</pre>
            </PanelSection>
          )}
          <PanelSection className="ai-chat-replay-panel-section" title={messages.decisionTimeline} titleClassName="ai-chat-replay-panel-section-title">
            <div className="ai-chat-replay-panel-timeline">
              {selectedReplayBundle.decisions.map((decision) => (
                <div key={`${decision.timestamp}-${decision.decision}`} className="ai-chat-replay-panel-timeline-row">
                  <span>{formatToolDecision(isZh, decision.decision)}{decision.reason ? ` · ${decision.reason}` : ''}</span>
                  <em>{new Date(decision.timestamp).toLocaleTimeString()}</em>
                </div>
              ))}
            </div>
          </PanelSection>
          <PanelSection className="ai-chat-replay-panel-section" title={messages.goldenPreview} titleClassName="ai-chat-replay-panel-section-title">
            <pre className="ai-chat-replay-panel-code ai-chat-replay-panel-code-scroll">{JSON.stringify(buildAiToolGoldenSnapshot(selectedReplayBundle), null, 2)}</pre>
          </PanelSection>
          <PanelSection
            className="ai-chat-replay-panel-section"
            title={messages.snapshotDiff}
            titleClassName="ai-chat-replay-panel-section-title"
            description={compareSnapshot ? messages.baseline(compactInternalId(compareSnapshot.requestId)) : messages.importAndCompare}
            meta={snapshotDiff ? (
              <span className={`ai-chat-replay-panel-diff-badge ${snapshotDiff.matches ? 'is-match' : 'is-changed'}`}>
                {snapshotDiff.matches ? messages.matches : messages.changed}
              </span>
            ) : undefined}
          >
            <div className="ai-chat-replay-panel-toolbar">
              <input
                type="file"
                accept=".json"
                className="ai-chat-replay-panel-file-input"
                aria-label={messages.importAndCompare}
                ref={importFileInputRef}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) onImportSnapshotFile(file);
                  e.currentTarget.value = '';
                }}
              />
              <PanelButton
                className="ai-chat-replay-panel-btn ai-chat-replay-panel-btn-compact"
                onClick={() => importFileInputRef.current?.click()}
              >
                {messages.importAndCompare}
              </PanelButton>
              {compareSnapshot && (
                <PanelButton
                  className="ai-chat-replay-panel-btn ai-chat-replay-panel-btn-compact"
                  onClick={onClearCompare}
                >
                  {messages.clearDiff}
                </PanelButton>
              )}
            </div>
          {snapshotDiff && compareSnapshot && (
            <>
              <div className="ai-chat-replay-panel-baseline">
                {messages.baseline(compactInternalId(compareSnapshot.requestId))}
              </div>
              <div className="ai-chat-replay-panel-diff-list">
                {snapshotDiff.fields.map((field) => (
                  <div key={field.label} className="ai-chat-replay-panel-diff-row">
                    <span className="ai-chat-replay-panel-diff-label">{field.label}</span>
                    {field.changed
                      ? <span className="ai-chat-replay-panel-diff-value is-changed">{field.baseline} {'\u2192'} {field.live}</span>
                      : <span className="ai-chat-replay-panel-diff-value is-match"><CheckIcon className="ai-chat-replay-panel-diff-icon" /></span>
                    }
                  </div>
                ))}
              </div>
            </>
          )}
          </PanelSection>
        </>
      )}
    </EmbeddedPanelShell>
  );
}
