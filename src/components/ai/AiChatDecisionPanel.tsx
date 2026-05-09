import type {
  CSSProperties,
  Dispatch,
  MutableRefObject,
  PointerEvent,
  RefObject,
  SetStateAction,
} from 'react';
import type {
  AiToolGoldenSnapshot,
  AiToolReplayBundle,
  AiToolSnapshotDiff,
} from '../../ai/auditReplay';
import type { getAiChatCardMessages } from '../../i18n/messages';
import { AiChatReplayDetailPanel } from './AiChatReplayDetailPanel';
import { AiChatDecisionListItem } from './AiChatDecisionListItem';

type DecisionItem = {
  id: string;
  toolName?: string;
  decision: string;
  reason?: string;
  reasonLabelEn?: string;
  reasonLabelZh?: string;
  message?: string;
  timestamp: string;
  requestId?: string | null;
  durationMs?: number;
};

export function AiChatDecisionPanel({
  cardMessages,
  showDecisionPanel,
  hasDecisionLogs,
  isDecisionPanelResizing,
  decisionPanelInlineStyle,
  decisionPanelToggleButtonRef,
  decisionPanelBodyRef,
  startDecisionPanelResize,
  aiToolDecisionLogs,
  replayLoadingRequestId,
  selectedReplayBundle,
  decisionReplayFocusRequestId,
  decisionReplayLocatedRequestId,
  decisionItemRefs,
  openReplayBundle,
  exportGoldenSnapshot,
  replayErrorMessage,
  isZh,
  showReplayDetailPanel,
  compareSnapshot,
  snapshotDiff,
  importFileInputRef,
  setShowReplayDetailPanel,
  setSelectedReplayBundle,
  setCompareSnapshot,
  setSnapshotDiff,
  importSnapshotForCompare,
  exportedSnapshotRequestId,
  onTogglePanel,
}: {
  cardMessages: ReturnType<typeof getAiChatCardMessages>;
  showDecisionPanel: boolean;
  hasDecisionLogs: boolean;
  isDecisionPanelResizing: boolean;
  decisionPanelInlineStyle: CSSProperties | undefined;
  decisionPanelToggleButtonRef: RefObject<HTMLButtonElement | null>;
  decisionPanelBodyRef: RefObject<HTMLDivElement | null>;
  startDecisionPanelResize: (event: PointerEvent<HTMLDivElement>) => void;
  aiToolDecisionLogs: DecisionItem[] | null | undefined;
  replayLoadingRequestId: string | null;
  selectedReplayBundle: AiToolReplayBundle | null;
  decisionReplayFocusRequestId: string | null;
  decisionReplayLocatedRequestId: string | null;
  decisionItemRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  openReplayBundle: (requestId: string) => Promise<void>;
  exportGoldenSnapshot: (requestId: string) => Promise<void>;
  replayErrorMessage: string | null;
  isZh: boolean;
  showReplayDetailPanel: boolean;
  compareSnapshot: AiToolGoldenSnapshot | null;
  snapshotDiff: AiToolSnapshotDiff | null;
  importFileInputRef: RefObject<HTMLInputElement | null>;
  setShowReplayDetailPanel: Dispatch<SetStateAction<boolean>>;
  setSelectedReplayBundle: Dispatch<SetStateAction<AiToolReplayBundle | null>>;
  setCompareSnapshot: Dispatch<SetStateAction<AiToolGoldenSnapshot | null>>;
  setSnapshotDiff: Dispatch<SetStateAction<AiToolSnapshotDiff | null>>;
  importSnapshotForCompare: (file: File) => void;
  exportedSnapshotRequestId: string | null;
  onTogglePanel: () => void;
}) {
  const decisionPanelStyleProps =
    decisionPanelInlineStyle !== undefined ? { style: decisionPanelInlineStyle } : {};

  return (
    <div
      className={`ai-chat-decision-panel ${showDecisionPanel ? 'is-open' : 'is-closed'}${hasDecisionLogs ? '' : ' is-empty'}${isDecisionPanelResizing ? ' is-resizing' : ''}`}
      {...decisionPanelStyleProps}
    >
      <button
        ref={decisionPanelToggleButtonRef}
        type="button"
        className="ai-chat-decision-panel-head"
        onClick={onTogglePanel}
        aria-expanded={showDecisionPanel}
      >
        <span className="ai-chat-decision-panel-title">
          {cardMessages.aiDecisions}
          <span className="ai-chat-decision-panel-bracket"> · </span>
          <span className="ai-chat-decision-panel-count">
            {aiToolDecisionLogs?.length ?? 0}
            {cardMessages.decisionCountSuffix}
          </span>
        </span>
        <span className="ai-chat-fold-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <div
        ref={decisionPanelBodyRef}
        className="ai-chat-decision-panel-body"
        aria-hidden={!showDecisionPanel}
      >
        {showDecisionPanel && (
          <div
            className="ai-chat-decision-panel-resizer"
            role="separator"
            aria-orientation="horizontal"
            aria-label={cardMessages.dragResizeDecisionPanelHeight}
            onPointerDown={startDecisionPanelResize}
          />
        )}
        {!hasDecisionLogs && <p className="ai-chat-fold-empty">{cardMessages.noDecisionsYet}</p>}
        <div className="ai-chat-decision-list">
          {(aiToolDecisionLogs ?? []).map((item) => (
            <AiChatDecisionListItem
              key={item.id}
              item={item}
              isZh={isZh}
              cardMessages={{
                unknownTool: cardMessages.unknownTool,
                loading: cardMessages.loading,
                replayOpened: cardMessages.replayOpened,
                replayCompare: cardMessages.replayCompare,
                snapshotExported: cardMessages.snapshotExported,
                exportSnapshot:
                  exportedSnapshotRequestId === item.requestId
                    ? cardMessages.snapshotExported
                    : cardMessages.exportSnapshot,
              }}
              isLoading={replayLoadingRequestId === item.requestId}
              isSelected={selectedReplayBundle?.requestId === item.requestId}
              isReplayFocus={decisionReplayFocusRequestId === item.requestId}
              isReplayLocated={decisionReplayLocatedRequestId === item.requestId}
              onReplay={(requestId) => {
                void openReplayBundle(requestId);
              }}
              onExportSnapshot={(requestId) => {
                void exportGoldenSnapshot(requestId);
              }}
              onRequestRef={(requestId, node) => {
                if (!requestId) return;
                decisionItemRefs.current[requestId] = node;
              }}
              onEscapeToHeader={() => decisionPanelToggleButtonRef.current?.focus()}
            />
          ))}
          {replayErrorMessage && <div className="ai-chat-decision-error">{replayErrorMessage}</div>}
          {selectedReplayBundle && (
            <AiChatReplayDetailPanel
              isZh={isZh}
              selectedReplayBundle={selectedReplayBundle}
              showReplayDetailPanel={showReplayDetailPanel}
              compareSnapshot={compareSnapshot}
              snapshotDiff={snapshotDiff}
              importFileInputRef={importFileInputRef}
              onToggleDetail={() => setShowReplayDetailPanel((prev) => !prev)}
              onClose={() => {
                setSelectedReplayBundle(null);
                setCompareSnapshot(null);
                setSnapshotDiff(null);
              }}
              onImportSnapshotFile={importSnapshotForCompare}
              onClearCompare={() => {
                setCompareSnapshot(null);
                setSnapshotDiff(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
