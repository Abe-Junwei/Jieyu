import type { AiChatSettings } from '../providers/providerCatalog';

/**
 * 判断设置补丁是否影响 AI 连接参数，需要重置连接探测。
 */
export function shouldResetConnectionForSettingsPatch(patch: Partial<AiChatSettings>): boolean {
  return (
    patch.providerKind !== undefined ||
    patch.baseUrl !== undefined ||
    patch.model !== undefined ||
    patch.apiKey !== undefined
  );
}
