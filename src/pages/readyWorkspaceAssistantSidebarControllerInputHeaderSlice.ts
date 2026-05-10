import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { AssistantSidebarObserverRecommendationInput } from './useTranscriptionAssistantSidebarController';
import type {
  UseTranscriptionAssistantSidebarControllerInputArgs,
  UseTranscriptionAssistantSidebarControllerInputHeaderArgs,
} from './useTranscriptionAssistantSidebarControllerInput';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';

export interface ReadyWorkspaceAssistantSidebarControllerInputHeaderSliceDeps {
  locale: string;
  analysisTab: AnalysisBottomTab;
  setAnalysisTab: (tab: AnalysisBottomTab) => void;
  timelineReadModelEpoch?: number;
  currentPage?: UseTranscriptionAssistantSidebarControllerInputArgs['currentPage'];
  selectionSnapshot: TranscriptionSelectionSnapshot;
  selectedTimelineRowMeta: AiChatContextValue['selectedRowMeta'];
  lexemeMatches: AiChatContextValue['lexemeMatches'];
  aiChatForSidebar: UseTranscriptionAssistantSidebarControllerInputArgs['aiChat'];
  aiToolDecisionLogs: AiChatContextValue['aiToolDecisionLogs'];
  aiVerticalWorkflowAuditEntries: AiChatContextValue['aiVerticalWorkflowAuditEntries'];
  observerStage: AiChatContextValue['observerStage'];
  actionableObserverRecommendations: AssistantSidebarObserverRecommendationInput[];
  onJumpToCitation: AiChatContextValue['onJumpToCitation'];
  adoptionItemsPushSinkRef?: AiChatContextValue['adoptionItemsPushSinkRef'];
}

export function buildReadyWorkspaceAssistantSidebarControllerInputHeaderSlice(
  deps: ReadyWorkspaceAssistantSidebarControllerInputHeaderSliceDeps,
): UseTranscriptionAssistantSidebarControllerInputHeaderArgs {
  return {
    locale: deps.locale,
    analysisTab: deps.analysisTab,
    onAnalysisTabChange: deps.setAnalysisTab,
    ...(deps.timelineReadModelEpoch !== undefined
      ? { timelineReadModelEpoch: deps.timelineReadModelEpoch }
      : {}),
    ...(deps.currentPage !== undefined ? { currentPage: deps.currentPage } : {}),
    selectedUnit: deps.selectionSnapshot.selectedUnit,
    selectedRowMeta: deps.selectedTimelineRowMeta,
    selectedUnitKind: deps.selectionSnapshot.selectedUnitKind,
    selectedLayerType: deps.selectionSnapshot.selectedLayerType,
    selectedText: deps.selectionSnapshot.selectedText,
    selectedTimeRangeLabel: deps.selectionSnapshot.selectedTimeRangeLabel ?? null,
    lexemeMatches: deps.lexemeMatches,
    aiChat: deps.aiChatForSidebar,
    aiToolDecisionLogs: deps.aiToolDecisionLogs,
    aiVerticalWorkflowAuditEntries: deps.aiVerticalWorkflowAuditEntries,
    observerStage: deps.observerStage,
    observerRecommendations: deps.actionableObserverRecommendations,
    onJumpToCitation: deps.onJumpToCitation,
    ...(deps.adoptionItemsPushSinkRef !== undefined
      ? { adoptionItemsPushSinkRef: deps.adoptionItemsPushSinkRef }
      : {}),
  };
}
