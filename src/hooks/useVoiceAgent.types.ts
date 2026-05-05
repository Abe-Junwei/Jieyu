import type { ActionId, ActionIntent, VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { CommercialProviderCreateConfig, SttEnhancementConfig, SttEnhancementSelectionKind } from '../services/stt';
import type { CommercialProviderKind, SttEngine } from '../services/VoiceInputService.types';
import type { VoiceMode } from '../services/voiceMode';

export type VoiceAgentMode = VoiceMode;

export interface VoicePendingConfirm {
  actionId: ActionId;
  label: string;
  fromFuzzy?: boolean;
  params?: { segmentIndex?: number };
}

export interface VoiceAgentState {
  listening: boolean;
  speechActive: boolean;
  mode: VoiceAgentMode;
  interimText: string;
  finalText: string;
  confidence: number;
  lastIntent: VoiceIntent | null;
  error: string | null;
  safeMode: boolean;
  pendingConfirm: VoicePendingConfirm | null;
  session: VoiceSession;
  engine: SttEngine;
  isRecording: boolean;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig: CommercialProviderCreateConfig;
  energyLevel: number;
  recordingDuration: number;
  wakeWordEnabled: boolean;
  wakeWordEnergyLevel: number;
  detectedLang: string | null;
  // Multi-agent pipeline state (Stage 1 new)
  agentState: 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking';
  /** 消歧备选列表 | Disambiguation alternatives for low-confidence fuzzy matches */
  disambiguationOptions: ActionIntent[];
}

export interface UseVoiceAgentOptions {
  /** ISO 639-3 corpus language code, e.g. 'cmn', 'jpn' */
  corpusLang?: string;
  /** Language override from the UI selector. '__auto__' = auto-detect, null = use corpusLang. */
  langOverride?: string | null;
  /** Execute a UI action by ActionId */
  executeAction: (actionId: ActionId, params?: { segmentIndex?: number }) => void;
  /** Send text to AI chat (for analysis/chat intents). The AI response is captured via setAnalysisFillCallback. */
  sendToAiChat?: (text: string) => void;
  /** Insert dictated text into the active field */
  insertDictation?: (text: string) => void;
  /** Continuous dictation pipeline callbacks for unit-by-unit fill */
  dictationPipeline?: {
    callbacks: import('../services/SpeechAnnotationPipeline').DictationPipelineCallbacks;
    config?: import('../services/SpeechAnnotationPipeline').QuickDictationConfig;
  };
  /** Initial safe mode state */
  initialSafeMode?: boolean;
  /** Optional LLM intent resolver for unmatched command-mode transcripts */
  resolveIntentWithLlm?: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
  /**
   * 与 AI 侧 `onToolCall` 同源的工具执行（语音 tool 意图真执行，见 ADR-0028）
   * Shared with AI chat `onToolCall` for real tool execution on voice `tool` intents.
   */
  executeVoiceToolCall?: import('../types/voiceAssistantToolCall').VoiceAssistantToolCallHandler;
  /** Whisper-server URL (used when engine === 'whisper-local') */
  whisperServerUrl?: string;
  /** Whisper-server model name (used when engine === 'whisper-local') */
  whisperServerModel?: string;
  /** Commercial STT provider kind (used when engine === 'commercial') */
  commercialProviderKind?: CommercialProviderKind;
  /** Commercial STT provider config (used when engine === 'commercial') */
  commercialProviderConfig?: CommercialProviderCreateConfig;
  /** Optional post-STT enhancement provider selection. */
  sttEnhancementKind?: SttEnhancementSelectionKind;
  /** Enhancement provider config for external alignment/diarization services. */
  sttEnhancementConfig?: SttEnhancementConfig;
  /** Initial wake-word detection state */
  initialWakeWordEnabled?: boolean;
}
