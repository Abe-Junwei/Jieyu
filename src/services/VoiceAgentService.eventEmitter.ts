/**
 * 浏览器安全事件分发器（从 VoiceAgentService 提取）
 * Browser-safe typed event emitter extracted from VoiceAgentService.
 */

export class BrowserEventEmitter<
  Events extends Record<string, unknown[]>,
> {
  private readonly listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<EventName extends keyof Events>(eventName: EventName, listener: (...args: Events[EventName]) => void): void {
    const eventListeners = this.listeners.get(eventName) ?? new Set<(...args: unknown[]) => void>();
    eventListeners.add(listener as (...args: unknown[]) => void);
    this.listeners.set(eventName, eventListeners);
  }

  off<EventName extends keyof Events>(eventName: EventName, listener: (...args: Events[EventName]) => void): void {
    const eventListeners = this.listeners.get(eventName);
    if (!eventListeners) return;
    eventListeners.delete(listener as (...args: unknown[]) => void);
    if (eventListeners.size === 0) this.listeners.delete(eventName);
  }

  emit<EventName extends keyof Events>(eventName: EventName, ...args: Events[EventName]): void {
    const eventListeners = this.listeners.get(eventName);
    if (!eventListeners || eventListeners.size === 0) return;
    for (const listener of [...eventListeners]) {
      listener(...args);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
