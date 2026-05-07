/**
 * Process-wide VoiceAgentService singleton — non-primary production path (ADR-0028).
 */

import type { VoiceAgentServiceOptions } from './VoiceAgentService.types';
import { VoiceAgentService } from './VoiceAgentService';

let _instance: VoiceAgentService | null = null;

/**
 * 返回当前进程内单例（若尚未 `createVoiceAgentService` 则为 null）。
 * 生产界面请使用 `useVoiceAgent`，勿依赖此单例。
 */
export function getVoiceAgentService(): VoiceAgentService | null {
  return _instance;
}

/**
 * 创建或替换全局 `VoiceAgentService` 单例。
 * **ADR-0028**：与 Hook 栈并行仅存此薄出口；编排与 STT→意图→分发与 `useVoiceAgentResultHandler` 共用 `assistantVoiceIntentDispatch` 等模块。
 */
export async function createVoiceAgentService(options: VoiceAgentServiceOptions = {}): Promise<VoiceAgentService> {
  if (_instance) {
    await _instance.dispose();
  }
  _instance = new VoiceAgentService(options);
  return _instance;
}
