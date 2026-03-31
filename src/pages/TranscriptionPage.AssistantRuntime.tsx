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
import type {
  TranscriptionPageAssistantRuntimeFrameProps,
  TranscriptionPageAssistantRuntimeProps,
  TranscriptionPageAssistantRuntimeVoiceProps,
} from './TranscriptionPage.runtimeContracts';

const VoiceAgentWidget = lazy(async () => import('../components/VoiceAgentWidget').then((module) => ({
  default: module.VoiceAgentWidget,
})));

const AiChatCard = lazy(async () => import('../components/ai/AiChatCard').then((module) => ({
  default: module.AiChatCard,
})));

interface AssistantVoiceRuntimeProps {
  locale: string;
  aiChatContextValue: AiChatContextValue;
  frame: TranscriptionPageAssistantRuntimeFrameProps;
  voice: TranscriptionPageAssistantRuntimeVoiceProps;
  openPanelOnMount: boolean;
  startListeningOnMount: boolean;
  onInitialVoiceRequestHandled: () => void;
}

interface AssistantRuntimeHostProps {
  aiChatContextValue: AiChatContextValue;
  aiAssistantHubContextValue: ReturnType<typeof pickAiAssistantHubContextValue>;
  voiceAgentContextValue: ReturnType<typeof pickVoiceAgentContextValue>;
  frame: TranscriptionPageAssistantRuntimeFrameProps;
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
  frame,
  toastVoiceAgent,
  voiceDrawer,
  voiceEntry,
}: AssistantRuntimeHostProps) {
  return (
    <VoiceAgentProvider value={voiceAgentContextValue}>
      <AiChatProvider value={aiChatContextValue}>
        <AiAssistantHubContext.Provider value={aiAssistantHubContextValue}>
          <ToastController
            voiceAgent={toastVoiceAgent}
            saveState={frame.saveState}
            recording={frame.recording}
            recordingUtteranceId={frame.recordingUtteranceId}
            recordingError={frame.recordingError}
            {...(frame.overlapCycleToast !== undefined ? { overlapCycleToast: frame.overlapCycleToast } : {})}
            {...(frame.lockConflictToast !== undefined ? { lockConflictToast: frame.lockConflictToast } : {})}
            tf={frame.tf}
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
  frame,
  voice,
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
    ...(voice.context.activeTextPrimaryLanguageId !== undefined ? { activeTextPrimaryLanguageId: voice.context.activeTextPrimaryLanguageId } : {}),
    getActiveTextPrimaryLanguageId: voice.context.getActiveTextPrimaryLanguageId,
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
    executeAction: voice.actions.intent.executeAction,
    handleResolveVoiceIntentWithLlm: voice.actions.intent.handleResolveVoiceIntentWithLlm,
    handleVoiceDictation: voice.actions.writeback.handleVoiceDictation,
    onVoiceAnalysisResult: voice.actions.writeback.handleVoiceAnalysisResult,
    selection: voice.target.selection,
    ...(voice.target.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: voice.target.defaultTranscriptionLayerId } : {}),
    translationLayers: voice.target.translationLayers,
    layers: voice.target.layers,
    ...(voice.target.dictationPipeline !== undefined ? { dictationPipeline: voice.target.dictationPipeline } : {}),
    formatLayerRailLabel: voice.target.formatLayerRailLabel,
    formatTime: voice.target.formatTime,
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
    voice.actions.lifecycle.onRegisterToggleVoice(featureFlags.voiceAgentEnabled ? voiceAgent.toggle : undefined);
    return () => voice.actions.lifecycle.onRegisterToggleVoice(undefined);
  }, [voice.actions.lifecycle, voiceAgent.toggle]);

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
            {...(voice.target.dictationPreviewTextProps !== undefined ? { dictationPreviewTextProps: voice.target.dictationPreviewTextProps } : {})}
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
      frame={frame}
      toastVoiceAgent={voiceAgent}
      voiceDrawer={voiceDrawer}
      voiceEntry={voiceEntry}
    />
  );
}

export function TranscriptionPageAssistantRuntime({
  locale,
  aiChatContextValue,
  frame,
  voice,
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
    voice.actions.lifecycle.onRegisterToggleVoice(featureFlags.voiceAgentEnabled ? handleActivateVoiceListening : undefined);
    return () => voice.actions.lifecycle.onRegisterToggleVoice(undefined);
  }, [handleActivateVoiceListening, voice.actions.lifecycle]);

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
        frame={frame}
        voice={voice}
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
      frame={frame}
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