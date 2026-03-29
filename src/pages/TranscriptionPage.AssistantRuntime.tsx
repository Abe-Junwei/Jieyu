import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AiAssistantHubContext } from '../contexts/AiAssistantHubContext';
import { DEFAULT_VOICE_AGENT_CONTEXT_VALUE, VoiceAgentProvider } from '../contexts/VoiceAgentContext';
import { AiChatProvider, type AiChatContextValue } from '../contexts/AiChatContext';
import { pickAiAssistantHubContextValue, useAiAssistantHubContextValue } from '../hooks/useAiAssistantHubContextValue';
import { useVoiceDock } from '../hooks/useVoiceDock';
import { useVoiceInteraction } from '../hooks/useVoiceInteraction';
import { pickVoiceAgentContextValue, useVoiceAgentContextValue } from '../hooks/useVoiceAgentContextValue';
import { ToastController } from './TranscriptionPage.ToastController';
import { featureFlags } from '../ai/config/featureFlags';
import type { LayerDocType, UtteranceDocType } from '../db';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';

const VoiceAgentWidget = lazy(async () => import('../components/VoiceAgentWidget').then((module) => ({
  default: module.VoiceAgentWidget,
})));

const AiChatCard = lazy(async () => import('../components/ai/AiChatCard').then((module) => ({
  default: module.AiChatCard,
})));

export interface TranscriptionPageAssistantRuntimeProps {
  locale: string;
  aiChatContextValue: AiChatContextValue;
  saveState: SaveState;
  recording: boolean;
  recordingUtteranceId: string | null;
  recordingError: string | null;
  overlapCycleToast?: { index: number; total: number; nonce: number } | null;
  lockConflictToast?: { count: number; speakers: string[]; nonce: number } | null;
  tf: (key: string, opts?: Record<string, unknown>) => string;
  activeTextPrimaryLanguageId?: string | null;
  getActiveTextPrimaryLanguageId: () => Promise<string | null>;
  executeAction: (actionId: string, params?: { segmentIndex?: number }) => void;
  handleResolveVoiceIntentWithLlm: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
  handleVoiceDictation: (text: string) => void;
  handleVoiceAnalysisResult: (utteranceId: string | null, analysisText: string) => void;
  activeUtteranceUnitId: string | null;
  selectedUtterance: UtteranceDocType | null;
  selectedRowMeta: { rowNumber: number; start: number; end: number } | null;
  selectedLayerId: string | null;
  defaultTranscriptionLayerId?: string;
  translationLayers: LayerDocType[];
  layers: LayerDocType[];
  formatLayerRailLabel: (layer: LayerDocType) => string;
  formatTime: (seconds: number) => string;
  onRegisterToggleVoice: (handler?: () => void) => void;
}

interface AssistantVoiceRuntimeProps extends Omit<TranscriptionPageAssistantRuntimeProps, 'aiChatContextValue' | 'locale'> {
  locale: string;
  aiChatContextValue: AiChatContextValue;
  openPanelOnMount: boolean;
  startListeningOnMount: boolean;
  onInitialVoiceRequestHandled: () => void;
}

interface AssistantRuntimeFrameProps {
  aiChatContextValue: AiChatContextValue;
  aiAssistantHubContextValue: ReturnType<typeof pickAiAssistantHubContextValue>;
  voiceAgentContextValue: ReturnType<typeof pickVoiceAgentContextValue>;
  saveState: SaveState;
  recording: boolean;
  recordingUtteranceId: string | null;
  recordingError: string | null;
  overlapCycleToast?: { index: number; total: number; nonce: number } | null;
  lockConflictToast?: { count: number; speakers: string[]; nonce: number } | null;
  tf: (key: string, opts?: Record<string, unknown>) => string;
  toastVoiceAgent: {
    agentState: string;
    mode: string;
    listening: boolean;
    isRecording: boolean;
  };
  voiceDrawer?: ReactNode;
  voiceEntry?: {
    enabled: boolean;
    expanded: boolean;
    listening: boolean;
    statusText?: string;
    onTogglePanel: () => void;
  } | undefined;
}

function AssistantRuntimeFrame({
  aiChatContextValue,
  aiAssistantHubContextValue,
  voiceAgentContextValue,
  saveState,
  recording,
  recordingUtteranceId,
  recordingError,
  overlapCycleToast,
  lockConflictToast,
  tf,
  toastVoiceAgent,
  voiceDrawer,
  voiceEntry,
}: AssistantRuntimeFrameProps) {
  return (
    <VoiceAgentProvider value={voiceAgentContextValue}>
      <AiChatProvider value={aiChatContextValue}>
        <AiAssistantHubContext.Provider value={aiAssistantHubContextValue}>
          <ToastController
            voiceAgent={toastVoiceAgent}
            saveState={saveState}
            recording={recording}
            recordingUtteranceId={recordingUtteranceId}
            recordingError={recordingError}
            {...(overlapCycleToast !== undefined ? { overlapCycleToast } : {})}
            {...(lockConflictToast !== undefined ? { lockConflictToast } : {})}
            tf={tf}
          />
          <div className="transcription-hub-assistant-panel">
            <div className="transcription-hub-assistant-chat-section">
              <Suspense fallback={null}>
                <AiChatCard
                  embedded
                  voiceDrawer={voiceDrawer}
                  voiceEntry={voiceEntry}
                />
              </Suspense>
            </div>
          </div>
        </AiAssistantHubContext.Provider>
      </AiChatProvider>
    </VoiceAgentProvider>
  );
}

function AssistantVoiceRuntime({
  locale,
  aiChatContextValue,
  saveState,
  recording,
  recordingUtteranceId,
  recordingError,
  overlapCycleToast,
  lockConflictToast,
  tf,
  activeTextPrimaryLanguageId,
  getActiveTextPrimaryLanguageId,
  executeAction,
  handleResolveVoiceIntentWithLlm,
  handleVoiceDictation,
  handleVoiceAnalysisResult,
  activeUtteranceUnitId,
  selectedUtterance,
  selectedRowMeta,
  selectedLayerId,
  defaultTranscriptionLayerId,
  translationLayers,
  layers,
  formatLayerRailLabel,
  formatTime,
  onRegisterToggleVoice,
  openPanelOnMount,
  startListeningOnMount,
  onInitialVoiceRequestHandled,
}: AssistantVoiceRuntimeProps) {
  const {
    effectiveVoiceCorpusLang,
    voiceCorpusLangOverride,
    handleVoiceSetLangOverride,
    handleCommercialConfigChange,
    commercialProviderKind,
    setCommercialProviderKind,
    commercialProviderConfig,
    setCommercialProviderConfig,
    localWhisperConfig,
  } = useVoiceDock({
    ...(activeTextPrimaryLanguageId !== undefined ? { activeTextPrimaryLanguageId } : {}),
    getActiveTextPrimaryLanguageId,
  });

  const toggleVoiceRef = useRef<(() => void) | undefined>(undefined);
  const {
    voiceAgent,
    assistantVoiceExpanded,
    voiceTargetSummary,
    voiceStatusSummary,
    voiceEnvironmentSummary,
    voiceSelectionSummary,
    handleVoiceCommercialConfigChange,
    handleVoiceAssistantIconClick,
    handleVoiceSwitchEngine,
    handleMicPointerDown,
    handleMicPointerUp,
    handleAssistantVoicePanelToggle,
  } = useVoiceInteraction({
    effectiveVoiceCorpusLang,
    voiceCorpusLangOverride,
    executeAction,
    handleResolveVoiceIntentWithLlm,
    handleVoiceDictation,
    onVoiceAnalysisResult: handleVoiceAnalysisResult,
    activeUtteranceUnitId,
    selectedUtterance,
    selectedRowMeta,
    selectedLayerId,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    translationLayers,
    layers,
    formatLayerRailLabel,
    formatTime,
    aiChatSend: async (text: string) => aiChatContextValue.onSendAiMessage?.(text),
    aiIsStreaming: aiChatContextValue.aiIsStreaming ?? false,
    aiMessages: aiChatContextValue.aiMessages ?? [],
    localWhisperConfig,
    commercialProviderKind,
    commercialProviderConfig,
    onCommercialConfigChange: handleCommercialConfigChange,
    setCommercialProviderKind,
    setCommercialProviderConfig,
    featureVoiceEnabled: featureFlags.voiceAgentEnabled,
    toggleVoiceRef,
  });

  useEffect(() => {
    onRegisterToggleVoice(featureFlags.voiceAgentEnabled ? voiceAgent.toggle : undefined);
    return () => onRegisterToggleVoice(undefined);
  }, [onRegisterToggleVoice, voiceAgent.toggle]);

  useEffect(() => {
    if (!openPanelOnMount && !startListeningOnMount) return;
    if (openPanelOnMount) {
      handleAssistantVoicePanelToggle();
    }
    if (startListeningOnMount) {
      voiceAgent.toggle();
    }
    onInitialVoiceRequestHandled();
  }, [handleAssistantVoicePanelToggle, onInitialVoiceRequestHandled, openPanelOnMount, startListeningOnMount, voiceAgent]);

  const voiceAgentContextValue = useVoiceAgentContextValue({
    voiceListening: voiceAgent.listening,
    voiceSpeechActive: voiceAgent.speechActive,
    voiceMode: voiceAgent.mode,
    voiceInterimText: voiceAgent.interimText,
    voiceFinalText: voiceAgent.finalText,
    voiceConfidence: voiceAgent.confidence,
    voiceError: voiceAgent.error,
    voiceSafeMode: voiceAgent.safeMode,
    voicePendingConfirm: voiceAgent.pendingConfirm,
    voiceCorpusLang: effectiveVoiceCorpusLang,
    voiceLangOverride: voiceCorpusLangOverride,
    voiceEnabled: featureFlags.voiceAgentEnabled,
    onVoiceToggle: voiceAgent.toggle,
    onVoiceSwitchMode: voiceAgent.switchMode,
    onVoiceConfirm: voiceAgent.confirmPending,
    onVoiceCancel: voiceAgent.cancelPending,
    onVoiceSetSafeMode: voiceAgent.setSafeMode,
  });

  const aiAssistantHubContextValue = useAiAssistantHubContextValue(aiChatContextValue, voiceAgentContextValue);

  const voiceEntry = useMemo(() => {
    if (!featureFlags.voiceAgentEnabled) return undefined;
    return {
      enabled: true,
      expanded: assistantVoiceExpanded,
      listening: voiceAgent.listening,
      statusText: voiceAgent.listening
        ? (locale === 'zh-CN' ? '监听中' : 'Listening')
        : (locale === 'zh-CN' ? '待命' : 'Standby'),
      onTogglePanel: handleAssistantVoicePanelToggle,
    };
  }, [assistantVoiceExpanded, handleAssistantVoicePanelToggle, locale, voiceAgent.listening]);

  const voiceDrawer = featureFlags.voiceAgentEnabled && assistantVoiceExpanded
    ? (
        <Suspense fallback={null}>
          <VoiceAgentWidget
            listening={voiceAgent.listening}
            speechActive={voiceAgent.speechActive}
            mode={voiceAgent.mode}
            interimText={voiceAgent.interimText}
            finalText={voiceAgent.finalText}
            confidence={voiceAgent.confidence}
            error={voiceAgent.error}
            lastIntent={voiceAgent.lastIntent}
            pendingConfirm={voiceAgent.pendingConfirm}
            disambiguationOptions={voiceAgent.disambiguationOptions}
            safeMode={voiceAgent.safeMode}
            wakeWordEnabled={voiceAgent.wakeWordEnabled}
            wakeWordEnergyLevel={voiceAgent.wakeWordEnergyLevel}
            corpusLang={effectiveVoiceCorpusLang}
            langOverride={voiceCorpusLangOverride}
            detectedLang={voiceAgent.detectedLang}
            engine={voiceAgent.engine}
            isRecording={voiceAgent.isRecording}
            energyLevel={voiceAgent.energyLevel}
            agentState={voiceAgent.agentState}
            recordingDuration={voiceAgent.recordingDuration}
            session={voiceAgent.session}
            commercialProviderKind={voiceAgent.commercialProviderKind}
            commercialProviderConfig={voiceAgent.commercialProviderConfig}
            targetSummary={voiceTargetSummary}
            statusSummary={voiceStatusSummary}
            environmentSummary={voiceEnvironmentSummary}
            selectionSummary={voiceSelectionSummary}
            onToggle={handleVoiceAssistantIconClick}
            onMicPointerDown={handleMicPointerDown}
            onMicPointerUp={handleMicPointerUp}
            onSwitchMode={voiceAgent.switchMode}
            onSwitchEngine={handleVoiceSwitchEngine}
            onSelectDisambiguation={voiceAgent.selectDisambiguation}
            onDismissDisambiguation={voiceAgent.dismissDisambiguation}
            onConfirm={voiceAgent.confirmPending}
            onCancel={voiceAgent.cancelPending}
            onSetSafeMode={voiceAgent.setSafeMode}
            onSetWakeWordEnabled={voiceAgent.setWakeWordEnabled}
            onSetLangOverride={handleVoiceSetLangOverride}
            onSetCommercialProviderKind={voiceAgent.setCommercialProviderKind}
            onCommercialConfigChange={handleVoiceCommercialConfigChange}
            onTestCommercialProvider={voiceAgent.testCommercialProvider}
          />
        </Suspense>
      )
    : undefined;

  return (
    <AssistantRuntimeFrame
      aiChatContextValue={aiChatContextValue}
      aiAssistantHubContextValue={aiAssistantHubContextValue}
      voiceAgentContextValue={voiceAgentContextValue}
      saveState={saveState}
      recording={recording}
      recordingUtteranceId={recordingUtteranceId}
      recordingError={recordingError}
      {...(overlapCycleToast !== undefined ? { overlapCycleToast } : {})}
      {...(lockConflictToast !== undefined ? { lockConflictToast } : {})}
      tf={tf}
      toastVoiceAgent={voiceAgent}
      voiceDrawer={voiceDrawer}
      voiceEntry={voiceEntry}
    />
  );
}

export function TranscriptionPageAssistantRuntime({
  locale,
  aiChatContextValue,
  saveState,
  recording,
  recordingUtteranceId,
  recordingError,
  overlapCycleToast,
  lockConflictToast,
  tf,
  activeTextPrimaryLanguageId,
  getActiveTextPrimaryLanguageId,
  executeAction,
  handleResolveVoiceIntentWithLlm,
  handleVoiceDictation,
  handleVoiceAnalysisResult,
  activeUtteranceUnitId,
  selectedUtterance,
  selectedRowMeta,
  selectedLayerId,
  defaultTranscriptionLayerId,
  translationLayers,
  layers,
  formatLayerRailLabel,
  formatTime,
  onRegisterToggleVoice,
}: TranscriptionPageAssistantRuntimeProps) {
  const [voiceRuntimeRequested, setVoiceRuntimeRequested] = useState(false);
  const [openVoicePanelOnMount, setOpenVoicePanelOnMount] = useState(false);
  const [startVoiceListeningOnMount, setStartVoiceListeningOnMount] = useState(false);

  const handleActivateVoicePanel = useCallback(() => {
    setVoiceRuntimeRequested(true);
    setOpenVoicePanelOnMount(true);
  }, []);

  const handleActivateVoiceListening = useCallback(() => {
    setVoiceRuntimeRequested(true);
    setStartVoiceListeningOnMount(true);
  }, []);

  useEffect(() => {
    onRegisterToggleVoice(featureFlags.voiceAgentEnabled ? handleActivateVoiceListening : undefined);
    return () => onRegisterToggleVoice(undefined);
  }, [handleActivateVoiceListening, onRegisterToggleVoice]);

  const dormantVoiceAgentContextValue = useMemo(() => pickVoiceAgentContextValue({
    ...DEFAULT_VOICE_AGENT_CONTEXT_VALUE,
    voiceEnabled: featureFlags.voiceAgentEnabled,
    onVoiceToggle: featureFlags.voiceAgentEnabled ? handleActivateVoiceListening : undefined,
  }), [handleActivateVoiceListening]);

  const dormantAssistantHubContextValue = useMemo(
    () => pickAiAssistantHubContextValue(aiChatContextValue, dormantVoiceAgentContextValue),
    [aiChatContextValue, dormantVoiceAgentContextValue],
  );

  const dormantVoiceEntry = useMemo(() => {
    if (!featureFlags.voiceAgentEnabled) return undefined;
    return {
      enabled: true,
      expanded: false,
      listening: false,
      statusText: locale === 'zh-CN' ? '点击启用语音' : 'Enable voice',
      onTogglePanel: handleActivateVoicePanel,
    };
  }, [handleActivateVoicePanel, locale]);

  const handleInitialVoiceRequestHandled = useCallback(() => {
    setOpenVoicePanelOnMount(false);
    setStartVoiceListeningOnMount(false);
  }, []);

  if (featureFlags.voiceAgentEnabled && voiceRuntimeRequested) {
    return (
      <AssistantVoiceRuntime
        locale={locale}
        aiChatContextValue={aiChatContextValue}
        saveState={saveState}
        recording={recording}
        recordingUtteranceId={recordingUtteranceId}
        recordingError={recordingError}
        {...(overlapCycleToast !== undefined ? { overlapCycleToast } : {})}
        {...(lockConflictToast !== undefined ? { lockConflictToast } : {})}
        tf={tf}
        {...(activeTextPrimaryLanguageId !== undefined ? { activeTextPrimaryLanguageId } : {})}
        getActiveTextPrimaryLanguageId={getActiveTextPrimaryLanguageId}
        executeAction={executeAction}
        handleResolveVoiceIntentWithLlm={handleResolveVoiceIntentWithLlm}
        handleVoiceDictation={handleVoiceDictation}
        handleVoiceAnalysisResult={handleVoiceAnalysisResult}
        activeUtteranceUnitId={activeUtteranceUnitId}
        selectedUtterance={selectedUtterance}
        selectedRowMeta={selectedRowMeta}
        selectedLayerId={selectedLayerId}
        {...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {})}
        translationLayers={translationLayers}
        layers={layers}
        formatLayerRailLabel={formatLayerRailLabel}
        formatTime={formatTime}
        onRegisterToggleVoice={onRegisterToggleVoice}
        openPanelOnMount={openVoicePanelOnMount}
        startListeningOnMount={startVoiceListeningOnMount}
        onInitialVoiceRequestHandled={handleInitialVoiceRequestHandled}
      />
    );
  }

  return (
    <AssistantRuntimeFrame
      aiChatContextValue={aiChatContextValue}
      aiAssistantHubContextValue={dormantAssistantHubContextValue}
      voiceAgentContextValue={dormantVoiceAgentContextValue}
      saveState={saveState}
      recording={recording}
      recordingUtteranceId={recordingUtteranceId}
      recordingError={recordingError}
      {...(overlapCycleToast !== undefined ? { overlapCycleToast } : {})}
      {...(lockConflictToast !== undefined ? { lockConflictToast } : {})}
      tf={tf}
      toastVoiceAgent={{
        agentState: 'idle',
        mode: 'command',
        listening: false,
        isRecording: false,
      }}
      voiceEntry={dormantVoiceEntry}
    />
  );
}