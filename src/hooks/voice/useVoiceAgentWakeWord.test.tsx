// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCallback, useRef, useState } from 'react';
import { useVoiceAgentWakeWord } from './useVoiceAgentWakeWord';

type EnergyCb = (rms: number) => void;
type WakeCb = () => void;

class FakeWakeWordDetector {
  static instances: FakeWakeWordDetector[] = [];
  readonly onWake: WakeCb;
  readonly onEnergy: EnergyCb | undefined;
  readonly speechMs: number;
  active = false;
  private speechStartTs: number | null = null;
  private triggered = false;

  constructor(options: {
    energyThreshold?: number;
    speechMs?: number;
    cooldownMs?: number;
    onWake: WakeCb;
    onEnergy?: EnergyCb;
  }) {
    this.onWake = options.onWake;
    this.onEnergy = options.onEnergy;
    this.speechMs = options.speechMs ?? 400;
    FakeWakeWordDetector.instances.push(this);
  }

  async start(): Promise<void> {
    this.active = true;
  }

  stop(): void {
    this.active = false;
    this.triggered = false;
    this.speechStartTs = null;
  }

  /** Simulate changing RMS samples over wall-clock time. */
  feed(rms: number, nowMs: number): void {
    this.onEnergy?.(rms);
    if (rms >= 0.05) {
      if (!this.triggered) {
        this.triggered = true;
        this.speechStartTs = nowMs;
      } else if (this.speechStartTs !== null && nowMs - this.speechStartTs >= this.speechMs) {
        this.onWake();
        this.stop();
      }
    } else {
      this.triggered = false;
      this.speechStartTs = null;
    }
  }
}

describe('useVoiceAgentWakeWord (#517)', () => {
  afterEach(() => {
    cleanup();
    FakeWakeWordDetector.instances = [];
    vi.useRealTimers();
  });

  it('keeps one detector across energy-driven re-renders and wakes after 400ms', async () => {
    vi.useFakeTimers();
    const onWake = vi.fn();
    const loadWakeWordRuntime = vi.fn(async () => ({
      WakeWordDetector: FakeWakeWordDetector,
    }));

    const { result, rerender } = renderHook(() => {
      const [wakeWordEnergyLevel, setWakeWordEnergyLevel] = useState(0);
      const [wakeWordEnabled] = useState(true);
      const wakeWordDetectorRef = useRef<FakeWakeWordDetector | null>(null);
      // Intentionally unstable without the hook's ref: new function each render.
      const unstableOnWake = useCallback(() => {
        onWake(wakeWordEnergyLevel);
      }, [wakeWordEnergyLevel]);

      useVoiceAgentWakeWord({
        wakeWordEnabled,
        listening: false,
        wakeWordDetectorRef: wakeWordDetectorRef as never,
        loadWakeWordRuntime: loadWakeWordRuntime as never,
        setWakeWordEnabledState: vi.fn(),
        setWakeWordEnergyLevel,
        onWake: unstableOnWake,
      });

      return { wakeWordDetectorRef, wakeWordEnergyLevel, setWakeWordEnergyLevel };
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(FakeWakeWordDetector.instances).toHaveLength(1);
    const detector = FakeWakeWordDetector.instances[0]!;
    expect(detector.active).toBe(true);

    await act(async () => {
      detector.feed(0.2, 0);
      rerender();
    });
    await act(async () => {
      detector.feed(0.25, 150);
      rerender();
    });
    await act(async () => {
      detector.feed(0.3, 300);
      rerender();
    });

    expect(FakeWakeWordDetector.instances).toHaveLength(1);
    expect(onWake).not.toHaveBeenCalled();

    await act(async () => {
      detector.feed(0.35, 400);
      rerender();
    });

    expect(FakeWakeWordDetector.instances).toHaveLength(1);
    expect(onWake).toHaveBeenCalledTimes(1);
    expect(result.current.wakeWordEnergyLevel).toBeGreaterThan(0);
  });
});
