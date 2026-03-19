import { Mic as _Mic } from 'lucide-react';
import { VoiceAgentWidget } from './VoiceAgentWidget';
import type { SttEngine, CommercialProviderKind } from '../services/VoiceInputService';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';

type VoiceAgentShape = {
  listening: boolean;
  speechActive: boolean;
  mode: 'command' | 'dictation' | 'analysis';
  interimText: string;
  finalText: string;
  confidence: number;
  error: string | null;
  lastIntent: VoiceIntent | null;
  pendingConfirm: { actionId: string; label: string } | null;
  safeMode: boolean;
  wakeWordEnabled: boolean;
  wakeWordEnergyLevel: number;
  engine: SttEngine;
  isRecording: boolean;
  energyLevel: number;
  recordingDuration: number;
  session: VoiceSession;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig: { apiKey?: string; baseUrl?: string; model?: string; appId?: string; accessToken?: string };
  detectedLang: string | null;
  agentState: 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking';
  switchMode: (mode: 'command' | 'dictation' | 'analysis') => void;
  switchEngine: (engine: SttEngine) => void;
  confirmPending: () => void;
  cancelPending: () => void;
  setSafeMode: (on: boolean) => void;
  setWakeWordEnabled: (on: boolean) => void;
  setCommercialProviderKind: (kind: CommercialProviderKind) => void;
  testCommercialProvider: () => Promise<{ available: boolean; error?: string }>;
};

type Props = {
  saveStateKind: string;
  recording: boolean;
  recordingError: string | null;
  voiceDockPos: { right: number; bottom: number };
  voiceDockDragging: boolean;
  voiceDockExpanded: boolean;
  voiceDockContainerRef: React.RefObject<HTMLElement | null>;
  voiceCorpusLang: string;
  voiceLangOverride: string | null;
  voiceAgent: VoiceAgentShape;
  onBubblePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onBubbleClick: () => void;
  onMicPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMicPointerUp: () => void;
  onSetLangOverride: (lang: string | null) => void;
  onCommercialConfigChange: (config: { apiKey?: string; baseUrl?: string; model?: string; appId?: string; accessToken?: string }) => void;
};

export function VoiceDockSection({
  saveStateKind,
  recording,
  recordingError,
  voiceDockPos,
  voiceDockDragging,
  voiceDockExpanded,
  voiceDockContainerRef,
  voiceCorpusLang,
  voiceLangOverride,
  voiceAgent,
  onBubblePointerDown,
  onBubbleClick,
  onMicPointerDown,
  onMicPointerUp,
  onSetLangOverride,
  onCommercialConfigChange,
}: Props) {
  const hasActiveToast = saveStateKind !== 'idle' || recording || Boolean(recordingError);
  const dockBottom = voiceDockPos.bottom + (hasActiveToast ? 92 : 0);
  const dockStyle = {
    right: `${voiceDockPos.right}px`,
    bottom: `${dockBottom}px`,
  } as React.CSSProperties;
  const bubbleStyle = {
    right: `${Math.max(-10, voiceDockPos.right - 12)}px`,
    bottom: `${dockBottom}px`,
  } as React.CSSProperties;
  const bubbleEdgeClass = voiceDockPos.right <= 28 ? 'transcription-voice-bubble-edge' : '';

  if (!voiceDockExpanded) {
    return (
      <button
        type="button"
        className={`transcription-voice-bubble ${bubbleEdgeClass} ${voiceDockDragging ? 'transcription-voice-dragging' : ''} ${voiceAgent.listening ? 'transcription-voice-bubble-active' : ''}`}
        style={bubbleStyle}
        aria-label="打开语音助手"
        onPointerDown={onBubblePointerDown}
        onClick={onBubbleClick}
      >
        <_Mic size={22} />
        <span className={`transcription-voice-bubble-dot ${voiceAgent.listening ? 'transcription-voice-bubble-dot-active' : ''}`} aria-hidden="true" />
      </button>
    );
  }

  return (
    <section
      ref={voiceDockContainerRef}
      className={`transcription-voice-dock ${voiceDockDragging ? 'transcription-voice-dragging' : ''} ${voiceAgent.listening ? 'transcription-voice-dock-active' : 'transcription-voice-dock-idle'}`}
      aria-label="语音智能体控制栏"
      style={dockStyle}
    >
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
        safeMode={voiceAgent.safeMode}
        wakeWordEnabled={voiceAgent.wakeWordEnabled}
        wakeWordEnergyLevel={voiceAgent.wakeWordEnergyLevel}
        corpusLang={voiceCorpusLang}
        langOverride={voiceLangOverride}
        detectedLang={voiceAgent.detectedLang}
        engine={voiceAgent.engine}
        isRecording={voiceAgent.isRecording}
        energyLevel={voiceAgent.energyLevel}
        recordingDuration={voiceAgent.recordingDuration}
        session={voiceAgent.session}
        commercialProviderKind={voiceAgent.commercialProviderKind}
        commercialProviderConfig={voiceAgent.commercialProviderConfig}
        onToggle={onBubbleClick}
        onMicPointerDown={onMicPointerDown}
        onMicPointerUp={onMicPointerUp}
        onSwitchMode={voiceAgent.switchMode}
        onSwitchEngine={voiceAgent.switchEngine}
        onConfirm={voiceAgent.confirmPending}
        onCancel={voiceAgent.cancelPending}
        onSetSafeMode={voiceAgent.setSafeMode}
        onSetWakeWordEnabled={voiceAgent.setWakeWordEnabled}
        onSetLangOverride={onSetLangOverride}
        onSetCommercialProviderKind={voiceAgent.setCommercialProviderKind}
        onCommercialConfigChange={onCommercialConfigChange}
        onTestCommercialProvider={voiceAgent.testCommercialProvider}
        agentState={voiceAgent.agentState}
      />
    </section>
  );
}
