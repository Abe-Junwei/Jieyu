import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VOICE_INPUT_ENGINE_SWITCH_DEBOUNCE_MS,
  VoiceInputEngineSwitchCoordinator,
} from './VoiceInputService.engineSwitchCoordinator';

describe('VoiceInputEngineSwitchCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('beginSwitch clears switching from invalidate and bumps token', () => {
    const c = new VoiceInputEngineSwitchCoordinator();
    const t1 = c.beginSwitch();
    expect(c.isSwitchingEngine).toBe(true);
    expect(t1).toBe(1);
    c.invalidate();
    expect(c.isSwitchingEngine).toBe(false);
    const t2 = c.beginSwitch();
    expect(t2).toBe(3);
  });

  it('scheduleDebounced runs after delay and clearSwitchingIfTokenCurrent respects stale tokens', () => {
    const c = new VoiceInputEngineSwitchCoordinator();
    const token = c.beginSwitch();
    const run = vi.fn();
    c.scheduleDebounced(token, run);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(VOICE_INPUT_ENGINE_SWITCH_DEBOUNCE_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
    c.clearSwitchingIfTokenCurrent(token);
    expect(c.isSwitchingEngine).toBe(false);
    c.beginSwitch();
    c.clearSwitchingIfTokenCurrent(token);
    expect(c.isSwitchingEngine).toBe(true);
  });

  it('invalidate cancels pending debounced run', () => {
    const c = new VoiceInputEngineSwitchCoordinator();
    const token = c.beginSwitch();
    const run = vi.fn();
    c.scheduleDebounced(token, run);
    c.invalidate();
    vi.advanceTimersByTime(VOICE_INPUT_ENGINE_SWITCH_DEBOUNCE_MS);
    expect(run).not.toHaveBeenCalled();
  });
});
