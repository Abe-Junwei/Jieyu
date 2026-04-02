/**
 * VoiceAgentService.state — 状态快照构建
 * Build immutable VoiceAgentService state snapshots.
 */

import type { GroundingContextData } from './VoiceAgentGroundingContext';
import type { VoiceAgentServiceState, VoiceAgentMode } from './VoiceAgentService';
import type { VoiceIntent, VoiceSession, ActionId } from './IntentRouter';
import type { SttEngine } from './VoiceInputService';
import type { CommercialProviderKind } from './VoiceInputService';
import type { CommercialProviderCreateConfig } from './stt';

export interface VoiceAgentServiceStateSnapshotInput {
  listening: boolean;
  speechActive: boolean;
  mode: VoiceAgentMode;
  interimText: string;
  finalText: string;
  confidence: number;
  lastIntent: VoiceIntent | null;
  error: string | null;
  safeMode: boolean;
  pendingConfirm: { actionId: ActionId; label: string; fromFuzzy?: boolean } | null;
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
  agentState: VoiceAgentServiceState['agentState'];
  groundingContext: GroundingContextData;
}

export function buildVoiceAgentServiceStateSnapshot(
  input: VoiceAgentServiceStateSnapshotInput,
): VoiceAgentServiceState {
  return {
    listening: input.listening,
    speechActive: input.speechActive,
    mode: input.mode,
    interimText: input.interimText,
    finalText: input.finalText,
    confidence: input.confidence,
    lastIntent: input.lastIntent,
    error: input.error,
    safeMode: input.safeMode,
    pendingConfirm: input.pendingConfirm,
    session: input.session,
    engine: input.engine,
    isRecording: input.isRecording,
    commercialProviderKind: input.commercialProviderKind,
    commercialProviderConfig: input.commercialProviderConfig,
    energyLevel: input.energyLevel,
    recordingDuration: input.recordingDuration,
    wakeWordEnabled: input.wakeWordEnabled,
    wakeWordEnergyLevel: input.wakeWordEnergyLevel,
    detectedLang: input.detectedLang,
    agentState: input.agentState,
    groundingContext: input.groundingContext,
  };
}
