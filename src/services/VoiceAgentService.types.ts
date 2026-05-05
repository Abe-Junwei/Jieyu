import type { Locale } from '../i18n';
import type { AnnotationLayer } from './SpeechAnnotationPipeline';
import type { CommercialProviderCreateConfig } from './stt';
import type { ActionId, VoiceIntent, VoiceSession } from './IntentRouter';
import type { GroundingContextData } from './VoiceAgentGroundingContext';
import type { CommercialProviderKind, SttEngine } from './VoiceInputService.types';
import type { VoiceMode } from './voiceMode';

export type VoiceAgentMode = VoiceMode;

export interface VoiceAgentServiceState {
  listening: boolean;
  speechActive: boolean;
  mode: VoiceAgentMode;
  interimText: string;
  finalText: string;
  confidence: number;
  lastIntent: VoiceIntent | null;
  error: string | null;
  safeMode: boolean;
  pendingConfirm: { actionId: ActionId; label: string; fromFuzzy?: boolean; params?: { segmentIndex?: number } } | null;
  session: VoiceSession;
  engine: SttEngine;
  isRecording: boolean;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig: CommercialProviderCreateConfig;
  sttEnhancementKind: import('./stt').SttEnhancementSelectionKind;
  sttEnhancementConfig: import('./stt').SttEnhancementConfig;
  energyLevel: number;
  recordingDuration: number;
  wakeWordEnabled: boolean;
  wakeWordEnergyLevel: number;
  detectedLang: string | null;
  // Multi-agent pipeline state
  agentState: 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking';
  // Grounding context (Stage 2)
  groundingContext: GroundingContextData;
}

export interface VoiceAgentServiceOptions {
  corpusLang?: string;
  langOverride?: string | null;
  locale?: Locale;
  initialSafeMode?: boolean;
  initialWakeWordEnabled?: boolean;
  /** Whisper-server URL for whisper-local engine (port 3040) */
  whisperServerUrl?: string;
  /** Whisper-server model name */
  whisperServerModel?: string;
  commercialProviderKind?: CommercialProviderKind;
  commercialProviderConfig?: CommercialProviderCreateConfig;
  sttEnhancementKind?: import('./stt').SttEnhancementSelectionKind;
  sttEnhancementConfig?: import('./stt').SttEnhancementConfig;
  /** Called when the user confirms a pending action */
  onExecuteAction?: (actionId: ActionId, params?: { segmentIndex?: number }) => void;
  /** Called for dictation text insertion */
  onInsertDictation?: (text: string) => void;
  /** Default transform hook for SpeechAnnotationPipeline fills */
  onTransformDictationPipelineFill?: (input: { layer: AnnotationLayer; text: string; segmentId: string }) => Promise<string>;
  /** Called for AI chat / analysis mode */
  onSendToAiChat?: (text: string) => void;
  /** Called when a VoiceActionTool intent is resolved — routes to useAiToolCallHandler */
  onToolCall?: (call: { name: string; arguments: Record<string, unknown> }) => Promise<{ ok: boolean; message: string }>;
  /** Optional LLM resolver for complex commands */
  resolveIntentWithLlm?: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
}
