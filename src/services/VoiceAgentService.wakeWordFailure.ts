import { createLogger } from '../observability/logger';
import type { VoiceAgentServiceState } from './VoiceAgentService.types';

const log = createLogger('VoiceAgentService');

const START_FAILED_MESSAGE = '语音唤醒启动失败，已自动关闭。请检查麦克风权限后重试。';
const SETUP_FAILED_MESSAGE = '语音唤醒初始化失败，已自动关闭。请稍后重试。';

export function applyVoiceAgentWakeWordFailure(input: {
  kind: 'start' | 'setup';
  err: unknown;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
}): void {
  if (input.kind === 'start') {
    log.warn('wake-word detector start failed, disabling', { err: input.err });
    input.setState({ wakeWordEnabled: false, error: START_FAILED_MESSAGE });
    return;
  }

  log.warn('wake-word detector setup failed, disabling', { err: input.err });
  input.setState({ wakeWordEnabled: false, error: SETUP_FAILED_MESSAGE });
}
