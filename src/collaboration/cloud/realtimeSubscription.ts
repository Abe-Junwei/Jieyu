import type { RealtimeChannel } from '@supabase/supabase-js';

const DEFAULT_SUBSCRIBE_TIMEOUT_MS = 15_000;

export interface SubscribeRealtimeChannelOptions {
  /** Timeout label for error messages | 超时文案中的通道描述 */
  channelLabel: string;
  timeoutMs?: number;
}

/**
 * Await Realtime channel SUBSCRIBED (shared by change + presence channels).
 * 等待 Realtime 频道进入 SUBSCRIBED（变更与 presence 共用）。
 */
export function subscribeRealtimeChannel(
  channel: RealtimeChannel,
  options: SubscribeRealtimeChannelOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SUBSCRIBE_TIMEOUT_MS;
  const { channelLabel } = options;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`${channelLabel} subscribe timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    channel.subscribe((status) => {
      if (settled) return;
      if (status === 'SUBSCRIBED') {
        settled = true;
        clearTimeout(timer);
        resolve();
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`${channelLabel} subscribe failed: ${status}`));
      }
    });
  });
}
