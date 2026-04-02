/**
 * VoiceAgentService.recordingControls — 录音控制辅助
 * Recording control helpers for VoiceAgentService.
 */

import type { VoiceInputService as VoiceInputServiceType } from './VoiceInputService';
import type { VoiceAgentServiceState } from './VoiceAgentService';

export interface StartVoiceAgentRecordingParams {
  ensureVoiceService: () => Promise<VoiceInputServiceType>;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
  getRecordingDuration: () => number;
  getRecordingDurationInterval: () => ReturnType<typeof setInterval> | null;
  setRecordingDurationInterval: (timer: ReturnType<typeof setInterval> | null) => void;
  onError: (error: unknown) => void;
}

export async function startVoiceAgentRecording(params: StartVoiceAgentRecordingParams): Promise<void> {
  const svc = await params.ensureVoiceService();
  params.setState({ agentState: 'listening' });
  try {
    await svc.startRecording();
    params.setState({ isRecording: true, recordingDuration: 0 });
    const timer = setInterval(() => {
      params.setState({ recordingDuration: params.getRecordingDuration() + 1 });
    }, 1000);
    params.setRecordingDurationInterval(timer);
  } catch (error) {
    const timer = params.getRecordingDurationInterval();
    if (timer !== null) {
      clearInterval(timer);
      params.setRecordingDurationInterval(null);
    }
    params.onError(error);
  }
}

export interface StopVoiceAgentRecordingParams {
  voiceService: VoiceInputServiceType | null;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
  getRecordingDurationInterval: () => ReturnType<typeof setInterval> | null;
  setRecordingDurationInterval: (timer: ReturnType<typeof setInterval> | null) => void;
}

export async function stopVoiceAgentRecording(params: StopVoiceAgentRecordingParams): Promise<void> {
  const timer = params.getRecordingDurationInterval();
  if (timer !== null) {
    clearInterval(timer);
    params.setRecordingDurationInterval(null);
  }
  params.setState({ isRecording: false, agentState: 'idle' });
  await params.voiceService?.stopRecording();
}
