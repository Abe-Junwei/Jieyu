import 'fake-indexeddb/auto';

class FakeGainNode {
  gain = {
    value: 0,
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  };

  connect(): void {}

  disconnect(): void {}
}

class FakeOscillatorNode {
  type: OscillatorType = 'sine';
  frequency = { value: 0 };
  onended: (() => void) | null = null;

  connect(): void {}

  disconnect(): void {}

  start(): void {}

  stop(): void {
    this.onended?.();
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {} as AudioDestinationNode;

  async resume(): Promise<void> {
    this.state = 'running';
  }

  createOscillator(): OscillatorNode {
    return new FakeOscillatorNode() as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
  }
}

if (typeof globalThis.AudioContext === 'undefined') {
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext,
  });
}

if (typeof (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext === 'undefined') {
  Object.defineProperty(globalThis, 'webkitAudioContext', {
    configurable: true,
    value: FakeAudioContext,
  });
}
