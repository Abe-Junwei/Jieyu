import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import type { AiSessionMemory, AiTaskSession } from '../../hooks/useAiChat';
import { t } from '../../i18n';
import { AiChatSummaryPanels } from './AiChatSummaryPanels';
import { AiChatMessageThread } from './AiChatMessageThread';
import { AiChatAlertsPanel } from './AiChatAlertsPanel';
import { AiChatCandidateChips } from './AiChatCandidateChips';
import { AiSourceSetBar } from './AiSourceSetBar';
import type { SavedCorpusSourceSet, SourceSetMemberType } from '../../ai/vertical/corpusSourceSet';

type SummaryPanelProps = ComponentProps<typeof AiChatSummaryPanels>;
type MessageThreadProps = ComponentProps<typeof AiChatMessageThread>;
type AlertsPanelProps = ComponentProps<typeof AiChatAlertsPanel>;
type CandidateChipsProps = ComponentProps<typeof AiChatCandidateChips>;

type AiChatInteractionShellProps =
  Omit<SummaryPanelProps,
    | 'onToggleConversationSummary'
    | 'onToggleVerticalWorkflowDetail'
    | 'onOpenLatestVerticalWorkflowReplay'
    | 'onCopyLatestVerticalWorkflowRequestId'
  >
  & Omit<MessageThreadProps, 'onToggleMessagePin' | 'onCopyAssistantMessage' | 'onToggleReasoning' | 'onActivateCitation'>
  & Omit<AlertsPanelProps,
    | 'debugUiShowAll'
    | 'aiIsStreaming'
    | 'aiPendingAgentLoopCheckpoint'
    | 'errorWarningText'
    | 'assistantDialogue'
    | 'persistLayerRecoveryActions'
    | 'onDismissErrorWarning'
    | 'onToggleAlertBar'
    | 'onOpenDecisionReplay'
    | 'onResumeAgentLoop'
    | 'onDismissAgentLoopHandoff'
    | 'onVoiceSelectDisambiguation'
    | 'onVoiceDismissDisambiguation'
    | 'onVoiceConfirmPending'
    | 'onVoiceCancelPending'
  >
  & {
    setShowConversationSummary: Dispatch<SetStateAction<boolean>>;
    setShowVerticalWorkflowDetail: Dispatch<SetStateAction<boolean>>;
    openLatestVerticalWorkflowReplay: SummaryPanelProps['onOpenLatestVerticalWorkflowReplay'];
    copyLatestVerticalWorkflowRequestId: SummaryPanelProps['onCopyLatestVerticalWorkflowRequestId'];
    toggleMessagePin: MessageThreadProps['onToggleMessagePin'];
    copyAssistantMessage: MessageThreadProps['onCopyAssistantMessage'];
    toggleReasoning: MessageThreadProps['onToggleReasoning'];
    activateCitation: MessageThreadProps['onActivateCitation'];
    setDismissedErrorWarning: Dispatch<SetStateAction<boolean>>;
    setShowAlertBar: Dispatch<SetStateAction<boolean>>;
    aiIsStreaming: boolean | undefined;
    errorWarningText: string | null | undefined;
    assistantDialogue: AlertsPanelProps['assistantDialogue'] | undefined;
    persistLayerRecoveryActions: AlertsPanelProps['persistLayerRecoveryActions'] | undefined;
    openReplayBundle: (requestId: string) => Promise<void> | void;
    onSendAiMessage?: ((message: string) => Promise<void> | void) | undefined;
    onDismissPendingAgentLoopCheckpoint?: (() => Promise<void> | void) | undefined;
    onVoiceSelectDisambiguation: AlertsPanelProps['onVoiceSelectDisambiguation'] | undefined;
    onVoiceDismissDisambiguation: AlertsPanelProps['onVoiceDismissDisambiguation'] | undefined;
    onVoiceConfirm?: (() => void) | undefined;
    onVoiceCancel?: (() => void) | undefined;
    aiSessionMemory: AiSessionMemory | null | undefined;
    aiTaskSession: AiTaskSession | null | undefined;
    rankedClarifyCandidates: CandidateChipsProps['candidates'];
    savedSourceSets?: readonly SavedCorpusSourceSet[];
    activeSourceSetId?: string | null;
    onSelectSourceSet?: (id: string) => void;
    onCreateSourceSet?: () => void;
    onAddSourceSetMember?: (setId: string, member: { id: string; type: SourceSetMemberType; label?: string }) => void;
    onRemoveSourceSetMember?: (setId: string, memberId: string) => void;
  };

export function AiChatInteractionShell(props: AiChatInteractionShellProps) {
  const {
    locale,
    cardMessages,
    hasConversationSummary,
    showConversationSummary,
    setShowConversationSummary,
    summaryQualityWarning,
    summaryEntries,
    latestVerticalWorkflowSummary,
    latestVerticalWorkflowEntry,
    latestVerticalWorkflowSelectionSummary,
    latestVerticalWorkflowSelectionKeywordSummary,
    latestVerticalWorkflowSelectionConfidenceSummary,
    latestVerticalWorkflowRequestId,
    showVerticalWorkflowDetail,
    setShowVerticalWorkflowDetail,
    isLatestVerticalReplayLoading,
    isLatestVerticalReplaySelected,
    copiedVerticalWorkflowRequestId,
    openLatestVerticalWorkflowReplay,
    copyLatestVerticalWorkflowRequestId,
    messageViewportRef,
    messages,
    turns,
    pinnedMessageIdSet,
    pinnedSummaryItems,
    expandedReasoningIds,
    copiedMessageId,
    canToggleMessagePin,
    canActivateCitation,
    toggleMessagePin,
    copyAssistantMessage,
    toggleReasoning,
    activateCitation,
    onClearAiMessages,
    isZh,
    aiIsStreaming,
    errorWarningText,
    dismissedErrorWarning,
    alertCount,
    showAlertBar,
    assistantDialogue,
    onVoiceSelectDisambiguation,
    onVoiceDismissDisambiguation,
    onVoiceConfirm,
    onVoiceCancel,
    aiPendingToolCall,
    aiSessionMemory,
    aiToolDecisionLogs,
    timelineReadModelEpoch,
    setDismissedErrorWarning,
    setShowAlertBar,
    openReplayBundle,
    onSendAiMessage,
    onDismissPendingAgentLoopCheckpoint,
    onConfirmPendingToolCall,
    onCancelPendingToolCall,
    persistLayerRecoveryActions,
    aiTaskSession,
    rankedClarifyCandidates,
    savedSourceSets,
    activeSourceSetId,
    onSelectSourceSet,
    onCreateSourceSet,
    onAddSourceSetMember,
    onRemoveSourceSetMember,
  } = props;

  return (
    <>
      {savedSourceSets !== undefined && (
        <AiSourceSetBar
          sourceSets={savedSourceSets}
          activeSourceSetId={activeSourceSetId ?? null}
          locale={locale}
          onSelectSourceSet={onSelectSourceSet}
          onCreateSourceSet={onCreateSourceSet}
          onAddMember={onAddSourceSetMember}
          onRemoveMember={onRemoveSourceSetMember}
        />
      )}
      <AiChatSummaryPanels
        locale={locale}
        cardMessages={cardMessages}
        hasConversationSummary={hasConversationSummary}
        showConversationSummary={showConversationSummary}
        onToggleConversationSummary={() => setShowConversationSummary((prev: boolean) => !prev)}
        summaryQualityWarning={summaryQualityWarning}
        summaryEntries={summaryEntries}
        latestVerticalWorkflowSummary={latestVerticalWorkflowSummary}
        latestVerticalWorkflowEntry={latestVerticalWorkflowEntry}
        latestVerticalWorkflowSelectionSummary={latestVerticalWorkflowSelectionSummary}
        latestVerticalWorkflowSelectionKeywordSummary={latestVerticalWorkflowSelectionKeywordSummary}
        latestVerticalWorkflowSelectionConfidenceSummary={latestVerticalWorkflowSelectionConfidenceSummary}
        latestVerticalWorkflowRequestId={latestVerticalWorkflowRequestId}
        showVerticalWorkflowDetail={showVerticalWorkflowDetail}
        onToggleVerticalWorkflowDetail={() => setShowVerticalWorkflowDetail((prev: boolean) => !prev)}
        isLatestVerticalReplayLoading={isLatestVerticalReplayLoading}
        isLatestVerticalReplaySelected={isLatestVerticalReplaySelected}
        copiedVerticalWorkflowRequestId={copiedVerticalWorkflowRequestId}
        onOpenLatestVerticalWorkflowReplay={openLatestVerticalWorkflowReplay}
        onCopyLatestVerticalWorkflowRequestId={copyLatestVerticalWorkflowRequestId}
      />
      <AiChatMessageThread
        locale={locale}
        cardMessages={cardMessages}
        messageViewportRef={messageViewportRef}
        messages={messages}
        turns={turns}
        pinnedMessageIdSet={pinnedMessageIdSet}
        pinnedSummaryItems={pinnedSummaryItems}
        expandedReasoningIds={expandedReasoningIds}
        copiedMessageId={copiedMessageId}
        canToggleMessagePin={canToggleMessagePin}
        canActivateCitation={canActivateCitation}
        onToggleMessagePin={toggleMessagePin}
        onCopyAssistantMessage={copyAssistantMessage}
        onToggleReasoning={toggleReasoning}
        onActivateCitation={activateCitation}
        onClearAiMessages={onClearAiMessages}
      />

      <AiChatAlertsPanel
        isZh={isZh}
        aiIsStreaming={Boolean(aiIsStreaming)}
        errorWarningText={errorWarningText ?? ''}
        dismissedErrorWarning={dismissedErrorWarning}
        alertCount={alertCount}
        debugUiShowAll={false}
        showAlertBar={showAlertBar}
        {...(assistantDialogue !== undefined ? { assistantDialogue } : {})}
        {...(onVoiceSelectDisambiguation !== undefined ? { onVoiceSelectDisambiguation } : {})}
        {...(onVoiceDismissDisambiguation !== undefined ? { onVoiceDismissDisambiguation } : {})}
        {...(onVoiceConfirm !== undefined ? { onVoiceConfirmPending: onVoiceConfirm } : {})}
        {...(onVoiceCancel !== undefined ? { onVoiceCancelPending: onVoiceCancel } : {})}
        aiPendingToolCall={aiPendingToolCall}
        aiPendingAgentLoopCheckpoint={aiSessionMemory?.pendingAgentLoopCheckpoint}
        aiToolDecisionLogs={aiToolDecisionLogs}
        timelineReadModelEpoch={timelineReadModelEpoch}
        onDismissErrorWarning={() => setDismissedErrorWarning(true)}
        onToggleAlertBar={() => setShowAlertBar((prev: boolean) => !prev)}
        onOpenDecisionReplay={(requestId: string) => openReplayBundle(requestId)}
        onResumeAgentLoop={() => {
          const resumeInput = t(locale, 'ai.alerts.agentLoopResumeDefaultInput');
          return onSendAiMessage?.(resumeInput);
        }}
        onDismissAgentLoopHandoff={onDismissPendingAgentLoopCheckpoint}
        onConfirmPendingToolCall={onConfirmPendingToolCall}
        onCancelPendingToolCall={onCancelPendingToolCall}
        {...(persistLayerRecoveryActions !== undefined ? { persistLayerRecoveryActions } : {})}
      />

      {aiTaskSession?.status === 'waiting_clarify' && (aiTaskSession.candidates ?? []).length > 0 && (
        <AiChatCandidateChips
          isZh={isZh}
          aiIsStreaming={Boolean(aiIsStreaming)}
          debugUiShowAll={false}
          candidates={rankedClarifyCandidates}
          onSendAiMessage={onSendAiMessage}
        />
      )}
    </>
  );
}
