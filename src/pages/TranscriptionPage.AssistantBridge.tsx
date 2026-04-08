import { useEffect, useMemo } from 'react';
import {
  useTranscriptionAiController,
  type UseTranscriptionAiControllerInput,
  type UseTranscriptionAiControllerResult,
} from './useTranscriptionAiController';
import type { AcousticRuntimeStatus } from '../contexts/AiPanelContext';
import type { AcousticPromptSummary } from './TranscriptionPage.aiPromptContext';
import type { AcousticPanelDetail } from '../utils/acousticPanelDetail';

type DeferredAiChatState = {
  enabled: UseTranscriptionAiControllerResult['aiChat']['enabled'];
  providerLabel: UseTranscriptionAiControllerResult['aiChat']['providerLabel'];
  settings: UseTranscriptionAiControllerResult['aiChat']['settings'];
  messages: UseTranscriptionAiControllerResult['aiChat']['messages'];
  isStreaming: UseTranscriptionAiControllerResult['aiChat']['isStreaming'];
  lastError: UseTranscriptionAiControllerResult['aiChat']['lastError'];
  connectionTestStatus: UseTranscriptionAiControllerResult['aiChat']['connectionTestStatus'];
  connectionTestMessage: UseTranscriptionAiControllerResult['aiChat']['connectionTestMessage'];
  contextDebugSnapshot: UseTranscriptionAiControllerResult['aiChat']['contextDebugSnapshot'];
  pendingToolCall: UseTranscriptionAiControllerResult['aiChat']['pendingToolCall'];
  taskSession: UseTranscriptionAiControllerResult['aiChat']['taskSession'];
  metrics: UseTranscriptionAiControllerResult['aiChat']['metrics'];
  sessionMemory: UseTranscriptionAiControllerResult['aiChat']['sessionMemory'];
  updateSettings: UseTranscriptionAiControllerResult['aiChat']['updateSettings'];
  testConnection: UseTranscriptionAiControllerResult['aiChat']['testConnection'];
  send: UseTranscriptionAiControllerResult['aiChat']['send'];
  stop: UseTranscriptionAiControllerResult['aiChat']['stop'];
  clear: UseTranscriptionAiControllerResult['aiChat']['clear'];
  confirmPendingToolCall: UseTranscriptionAiControllerResult['aiChat']['confirmPendingToolCall'];
  cancelPendingToolCall: UseTranscriptionAiControllerResult['aiChat']['cancelPendingToolCall'];
  trackRecommendationEvent: UseTranscriptionAiControllerResult['aiChat']['trackRecommendationEvent'];
};

export interface DeferredTranscriptionAiRuntimeState {
  aiChat: DeferredAiChatState;
  aiToolDecisionLogs: UseTranscriptionAiControllerResult['aiToolDecisionLogs'];
  acousticRuntimeStatus: AcousticRuntimeStatus;
  acousticSummary: AcousticPromptSummary | null;
  acousticDetail: AcousticPanelDetail | null;
  onJumpToAcousticHotspot: (timeSec: number) => void;
}

interface TranscriptionPageAssistantBridgeProps {
  controllerInput: UseTranscriptionAiControllerInput;
  onRuntimeStateChange: (state: DeferredTranscriptionAiRuntimeState) => void;
}

function TranscriptionPageAssistantBridge({
  controllerInput,
  onRuntimeStateChange,
}: TranscriptionPageAssistantBridgeProps) {
  const {
    aiChat,
    aiToolDecisionLogs,
    acousticRuntimeStatus,
    acousticSummary,
    acousticDetail,
    handleJumpToAcousticHotspot,
  } = useTranscriptionAiController(controllerInput);

  const runtimeState = useMemo<DeferredTranscriptionAiRuntimeState>(() => ({
    aiChat: {
      enabled: aiChat.enabled,
      providerLabel: aiChat.providerLabel,
      settings: aiChat.settings,
      messages: aiChat.messages,
      isStreaming: aiChat.isStreaming,
      lastError: aiChat.lastError,
      connectionTestStatus: aiChat.connectionTestStatus,
      connectionTestMessage: aiChat.connectionTestMessage,
      contextDebugSnapshot: aiChat.contextDebugSnapshot,
      pendingToolCall: aiChat.pendingToolCall,
      taskSession: aiChat.taskSession,
      metrics: aiChat.metrics,
      sessionMemory: aiChat.sessionMemory,
      updateSettings: aiChat.updateSettings,
      testConnection: aiChat.testConnection,
      send: aiChat.send,
      stop: aiChat.stop,
      clear: aiChat.clear,
      confirmPendingToolCall: aiChat.confirmPendingToolCall,
      cancelPendingToolCall: aiChat.cancelPendingToolCall,
      trackRecommendationEvent: aiChat.trackRecommendationEvent,
    },
    aiToolDecisionLogs,
    acousticRuntimeStatus,
    acousticSummary,
    acousticDetail,
    onJumpToAcousticHotspot: handleJumpToAcousticHotspot,
  }), [
    acousticRuntimeStatus,
    acousticDetail,
    acousticSummary,
    aiChat.cancelPendingToolCall,
    aiChat.clear,
    aiChat.confirmPendingToolCall,
    aiChat.connectionTestMessage,
    aiChat.connectionTestStatus,
    aiChat.contextDebugSnapshot,
    aiChat.enabled,
    aiChat.isStreaming,
    aiChat.lastError,
    aiChat.messages,
    aiChat.metrics,
    aiChat.pendingToolCall,
    aiChat.providerLabel,
    aiChat.send,
    aiChat.sessionMemory,
    aiChat.settings,
    aiChat.stop,
    aiChat.taskSession,
    aiChat.testConnection,
    aiChat.trackRecommendationEvent,
    aiChat.updateSettings,
    aiToolDecisionLogs,
    handleJumpToAcousticHotspot,
  ]);

  useEffect(() => {
    onRuntimeStateChange(runtimeState);
  }, [onRuntimeStateChange, runtimeState]);

  return null;
}

export { TranscriptionPageAssistantBridge };