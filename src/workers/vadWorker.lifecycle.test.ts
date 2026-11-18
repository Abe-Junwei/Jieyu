/**
 * Worker 生命周期契约。脚本会话不跑真模型，只记录每一帧收到的 state/context。
 * 真模型用例走 onnxruntime-node，生产 Worker 用的是 onnxruntime-web，两边分开写。
 *
 * Worker lifecycle contract. The scripted session does not run the real model; it records the
 * state/context each frame receives. The real-model case uses onnxruntime-node. Production
 * workers use onnxruntime-web. Those two are separate tests.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WhisperXVadService } from '../services/vad/WhisperXVadService';
import {
  SILERO_CONTEXT_SAMPLES,
  SILERO_FRAME_SAMPLES,
  type SileroOrtLike,
  type SileroSessionLike,
  type SileroTensorLike,
} from '../utils/vadWorkerInferenceUtils';
import { createVadWorkerHandler, type VadWorkerOutbound } from './vadWorker';

const MODEL = join(process.cwd(), 'public/models/silero_vad.onnx');
const FILL_A = 0.25;
const FILL_B = 0.5;

interface FrameCall {
  state0: number;
  state1: number;
  context0: number;
  frame0: number;
}

class FakeTensor {
  constructor(
    public type: 'float32' | 'int64',
    public data: Float32Array | BigInt64Array,
    public dims: readonly number[],
  ) {}
}

const fakeOrt = { Tensor: FakeTensor } as unknown as SileroOrtLike;

class ScriptedSession implements SileroSessionLike {
  readonly calls: FrameCall[] = [];
  defer = false;
  failOnCall: number | null = null;
  private seen = 0;
  private readonly waiters: Array<() => void> = [];

  async run(feeds: Record<string, SileroTensorLike>): Promise<Record<string, SileroTensorLike>> {
    const state = feeds['state']?.data as Float32Array;
    const input = feeds['input']?.data as Float32Array;
    this.seen += 1;
    const callNumber = this.seen;
    this.calls.push({
      state0: state[0] ?? 0,
      state1: state[1] ?? 0,
      context0: input[0] ?? 0,
      frame0: input[SILERO_CONTEXT_SAMPLES] ?? 0,
    });
    if (this.failOnCall === callNumber) {
      throw new Error('scripted inference failure');
    }
    if (this.defer) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    const next = new Float32Array(state);
    next[0] = (state[0] ?? 0) + 1;
    next[1] = input[SILERO_CONTEXT_SAMPLES] ?? 0;
    return {
      output: { data: new Float32Array([0.01]), dims: [1, 1] },
      stateN: { data: next, dims: [2, 1, 128] },
    };
  }

  release(): void {
    const resolve = this.waiters.shift();
    if (resolve === undefined) throw new Error('no deferred Silero frame');
    resolve();
  }
}

function pcm(frames: number, fill: number): Float32Array {
  const data = new Float32Array(frames * SILERO_FRAME_SAMPLES);
  data.fill(fill);
  return data;
}

function message(data: Record<string, unknown>): MessageEvent {
  return { data } as MessageEvent;
}

async function untilCalls(session: ScriptedSession, count: number): Promise<void> {
  for (let i = 0; i < 30 && session.calls.length < count; i += 1) {
    await Promise.resolve();
  }
  if (session.calls.length < count) {
    throw new Error(`expected ${count} frame calls, saw ${session.calls.length}`);
  }
}

function setup(): {
  session: ScriptedSession;
  messages: VadWorkerOutbound[];
  handler: (event: MessageEvent) => Promise<void>;
} {
  const session = new ScriptedSession();
  const messages: VadWorkerOutbound[] = [];
  const handler = createVadWorkerHandler((outbound) => messages.push(outbound), {
    loadRuntime: async () => ({ ort: fakeOrt, session }),
  });
  return { session, messages, handler };
}

async function initHandler(handler: (event: MessageEvent) => Promise<void>): Promise<void> {
  await handler(message({ type: 'init', modelUrl: '/models/silero_vad.onnx' }));
}

function detect(id: string, frames: number, fill: number): MessageEvent {
  return message({
    type: 'detect',
    id,
    pcm: pcm(frames, fill),
    sampleRate: 16_000,
  });
}

describe('vad worker recurrent state (scripted session, not real inference)', () => {
  it('detect B after detect A matches detect B alone', async () => {
    const reused = setup();
    await initHandler(reused.handler);
    await reused.handler(detect('media-a', 3, FILL_A));
    await reused.handler(detect('media-b', 2, FILL_B));

    const alone = setup();
    await initHandler(alone.handler);
    await alone.handler(detect('media-b', 2, FILL_B));

    const reusedB = reused.session.calls.filter((call) => call.frame0 === FILL_B);
    expect(reusedB).toEqual(alone.session.calls);
    expect(reusedB.map((call) => call.state0)).toEqual([0, 1]);
    expect(reusedB.map((call) => call.context0)).toEqual([0, FILL_B]);
    expect(reused.messages.filter((item) => item.type === 'result').map((item) => item.id)).toEqual(
      ['media-a', 'media-b'],
    );
  });

  it('keeps state across chunks of one streaming session', async () => {
    const { session, handler } = setup();
    await initHandler(handler);
    await handler(message({ type: 'detect-stream-start', id: 'stream-1', sampleRate: 16_000 }));
    await handler(message({ type: 'detect-stream-chunk', id: 'stream-1', pcm: pcm(2, FILL_A) }));
    await untilCalls(session, 2);
    await handler(message({ type: 'detect-stream-chunk', id: 'stream-1', pcm: pcm(1, FILL_A) }));
    await untilCalls(session, 3);

    expect(session.calls.map((call) => call.state0)).toEqual([0, 1, 2]);
    expect(session.calls.map((call) => call.state1)).toEqual([0, FILL_A, FILL_A]);
    expect(session.calls.map((call) => call.context0)).toEqual([0, FILL_A, FILL_A]);
  });

  it('starts a later detect from zero after a streaming session ends', async () => {
    const { session, handler, messages } = setup();
    await initHandler(handler);
    await handler(message({ type: 'detect-stream-start', id: 'stream-1', sampleRate: 16_000 }));
    await handler(message({ type: 'detect-stream-chunk', id: 'stream-1', pcm: pcm(2, FILL_A) }));
    await untilCalls(session, 2);
    await handler(message({ type: 'detect-stream-end', id: 'stream-1' }));
    await untilCalls(session, 2);
    for (let i = 0; i < 20 && !messages.some((item) => item.type === 'result'); i += 1) {
      await Promise.resolve();
    }

    await handler(detect('media-b', 1, FILL_B));
    expect(session.calls.at(-1)).toMatchObject({
      state0: 0,
      state1: 0,
      context0: 0,
      frame0: FILL_B,
    });
  });

  it('starts a streaming session from zero after a batch detect', async () => {
    const { session, handler } = setup();
    await initHandler(handler);
    await handler(detect('media-a', 2, FILL_A));
    await handler(message({ type: 'detect-stream-start', id: 'stream-1', sampleRate: 16_000 }));
    await handler(message({ type: 'detect-stream-chunk', id: 'stream-1', pcm: pcm(1, FILL_B) }));
    await untilCalls(session, 3);
    expect(session.calls[2]).toMatchObject({
      state0: 0,
      state1: 0,
      context0: 0,
      frame0: FILL_B,
    });
  });

  it('interleaved detects do not read each others recurrent state', async () => {
    const { session, handler } = setup();
    session.defer = true;
    await initHandler(handler);

    const first = handler(detect('media-a', 3, FILL_A));
    await untilCalls(session, 1);
    session.release();
    await untilCalls(session, 2);

    const second = handler(detect('media-b', 1, FILL_B));
    await untilCalls(session, 3);
    expect(session.calls[2]).toMatchObject({
      state0: 0,
      state1: 0,
      context0: 0,
      frame0: FILL_B,
    });

    session.release();
    await untilCalls(session, 4);
    expect(session.calls[3]).toMatchObject({
      state0: 2,
      state1: FILL_A,
      context0: FILL_A,
      frame0: FILL_A,
    });
    session.release();
    session.release();
    await first;
    await second;
  });

  it('an in-flight detect keeps its state when a streaming session starts', async () => {
    const { session, handler } = setup();
    session.defer = true;
    await initHandler(handler);

    const detectPromise = handler(detect('media-a', 2, FILL_A));
    await untilCalls(session, 1);
    await handler(message({ type: 'detect-stream-start', id: 'stream-1', sampleRate: 16_000 }));
    const chunkPromise = handler(
      message({ type: 'detect-stream-chunk', id: 'stream-1', pcm: pcm(1, FILL_B) }),
    );
    await untilCalls(session, 2);
    expect(session.calls[1]).toMatchObject({
      state0: 0,
      state1: 0,
      context0: 0,
      frame0: FILL_B,
    });

    session.release();
    await untilCalls(session, 3);
    expect(session.calls[2]).toMatchObject({
      state0: 1,
      state1: FILL_A,
      context0: FILL_A,
      frame0: FILL_A,
    });
    session.release();
    session.release();
    await detectPromise;
    await chunkPromise;
  });

  it('a failed detect does not leave state for the next media', async () => {
    const { session, handler, messages } = setup();
    session.failOnCall = 2;
    await initHandler(handler);
    await handler(detect('media-a', 3, FILL_A));
    expect(messages.some((item) => item.id === 'media-a' && item.type === 'error')).toBe(true);

    session.failOnCall = null;
    await handler(detect('media-b', 1, FILL_B));
    expect(session.calls.at(-1)).toMatchObject({
      state0: 0,
      state1: 0,
      context0: 0,
      frame0: FILL_B,
    });
  });

  it('a cancelled detect does not leave state for the next media', async () => {
    const { session, handler, messages } = setup();
    session.defer = true;
    await initHandler(handler);
    const pending = handler(detect('media-a', 2, FILL_A));
    await untilCalls(session, 1);
    await handler(message({ type: 'cancel', id: 'media-a' }));
    session.release();
    await pending;
    expect(
      messages.some((item) => item.id === 'media-a' && item.message === 'VAD detect aborted'),
    ).toBe(true);

    session.defer = false;
    await handler(detect('media-b', 1, FILL_B));
    expect(session.calls.at(-1)).toMatchObject({
      state0: 0,
      state1: 0,
      context0: 0,
      frame0: FILL_B,
    });
  });

  it('cancelling a superseded stream does not drop the replacement session', async () => {
    const { session, handler, messages } = setup();
    session.defer = true;
    await initHandler(handler);
    await handler(message({ type: 'detect-stream-start', id: 'stream-a', sampleRate: 16_000 }));
    const oldChunk = handler(
      message({ type: 'detect-stream-chunk', id: 'stream-a', pcm: pcm(1, FILL_A) }),
    );
    await untilCalls(session, 1);
    await handler(message({ type: 'detect-stream-start', id: 'stream-b', sampleRate: 16_000 }));
    await handler(message({ type: 'cancel', id: 'stream-a' }));
    session.release();
    await oldChunk;

    const newChunk = handler(
      message({ type: 'detect-stream-chunk', id: 'stream-b', pcm: pcm(1, FILL_B) }),
    );
    await untilCalls(session, 2);
    expect(session.calls[1]).toMatchObject({
      state0: 0,
      state1: 0,
      context0: 0,
      frame0: FILL_B,
    });
    expect(messages.some((item) => item.id === 'stream-b' && item.type === 'error')).toBe(false);
    session.release();
    await newChunk;
  });

  it('reset drops the streaming session and the next detect still starts at zero', async () => {
    const { session, handler, messages } = setup();
    await initHandler(handler);
    await handler(message({ type: 'detect-stream-start', id: 'stream-1', sampleRate: 16_000 }));
    await handler(message({ type: 'detect-stream-chunk', id: 'stream-1', pcm: pcm(1, FILL_A) }));
    await untilCalls(session, 1);
    await handler(message({ type: 'reset' }));
    await handler(message({ type: 'detect-stream-chunk', id: 'stream-1', pcm: pcm(1, FILL_B) }));
    expect(messages.some((item) => item.id === 'stream-1' && item.type === 'error')).toBe(true);
    await handler(detect('media-b', 1, FILL_B));
    expect(session.calls.at(-1)).toMatchObject({
      state0: 0,
      state1: 0,
      context0: 0,
      frame0: FILL_B,
    });
  });
});

describe('WhisperXVadService reused worker (scripted session, not real inference)', () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it('sequential media detects do not send reset and do not inherit state', async () => {
    const session = new ScriptedSession();
    const inbound: string[] = [];

    class HandlerWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      private readonly handle: (event: MessageEvent) => Promise<void>;

      constructor() {
        this.handle = createVadWorkerHandler(
          (outbound) => {
            this.onmessage?.({ data: outbound } as MessageEvent);
          },
          { loadRuntime: async () => ({ ort: fakeOrt, session }) },
        );
      }

      postMessage(data: unknown, ..._ignored: unknown[]): void {
        inbound.push((data as { type: string }).type);
        void this.handle({ data } as MessageEvent);
      }

      terminate(): void {
        /* no-op */
      }
    }

    // @ts-expect-error test double replaces Worker
    globalThis.Worker = HandlerWorker;
    const service = new WhisperXVadService();
    await service.init();
    await service.detectSpeechSegments(audioBuffer(FILL_A));
    await service.detectSpeechSegments(audioBuffer(FILL_B));
    service.dispose();

    expect(inbound.filter((type) => type === 'reset')).toEqual([]);
    expect(inbound.filter((type) => type === 'detect')).toHaveLength(2);
    expect(session.calls[1]).toMatchObject({
      state0: 0,
      state1: 0,
      context0: 0,
      frame0: FILL_B,
    });
  });
});

function audioBuffer(fill: number): AudioBuffer {
  const data = new Float32Array(SILERO_FRAME_SAMPLES);
  data.fill(fill);
  return {
    sampleRate: 16_000,
    length: data.length,
    duration: data.length / 16_000,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

describe('real Silero session through the worker handler (onnxruntime-node)', () => {
  it('independent media match a fresh run, and one stream matches one detect', async () => {
    const ort = await loadOrtNode();
    if (!existsSync(MODEL)) return;
    expect(ort, 'onnxruntime-node should be installed').not.toBeNull();
    if (!ort) return;

    const real = (await ort.InferenceSession.create(MODEL)) as SileroSessionLike;
    const tone = syntheticTone(2);
    const quiet = new Float32Array(SILERO_FRAME_SAMPLES * 2);

    const streamed = await runReal(ort, real, async (handler, inputs) => {
      await handler(message({ type: 'detect-stream-start', id: 'stream-1', sampleRate: 16_000 }));
      await handler(
        message({ type: 'detect-stream-chunk', id: 'stream-1', pcm: tone.slice(0, 512) }),
      );
      await waitForInputs(inputs, 1);
      await handler(
        message({
          type: 'detect-stream-chunk',
          id: 'stream-1',
          pcm: tone.slice(512),
        }),
      );
      await waitForInputs(inputs, 2);
      await handler(message({ type: 'detect-stream-end', id: 'stream-1' }));
      await waitForInputs(inputs, 2);
    });

    const batched = await runReal(ort, real, async (handler) => {
      await handler(message({ type: 'detect', id: 'tone', pcm: tone, sampleRate: 16_000 }));
    });
    expect(streamed.map(snapshot)).toEqual(batched.map(snapshot));
    expect(batched[1]?.state.some((value) => value !== 0)).toBe(true);

    const afterOtherMedia = await runReal(ort, real, async (handler) => {
      await handler(message({ type: 'detect', id: 'tone', pcm: tone, sampleRate: 16_000 }));
      await handler(message({ type: 'detect', id: 'quiet', pcm: quiet, sampleRate: 16_000 }));
    });
    const quietAlone = await runReal(ort, real, async (handler) => {
      await handler(message({ type: 'detect', id: 'quiet', pcm: quiet, sampleRate: 16_000 }));
    });
    const quietAfterTone = afterOtherMedia.slice(toneFrames(tone));
    expect(quietAfterTone.map(snapshot)).toEqual(quietAlone.map(snapshot));
    expect(quietAfterTone[0]?.state.every((value) => value === 0)).toBe(true);
    expect(quietAfterTone[0]?.context.every((value) => value === 0)).toBe(true);
  }, 30_000);
});

interface RealFrameInput {
  state: Float32Array;
  context: Float32Array;
}

function snapshot(frame: RealFrameInput): { state: number[]; context: number[] } {
  return { state: Array.from(frame.state), context: Array.from(frame.context) };
}

function toneFrames(tone: Float32Array): number {
  return Math.floor(tone.length / SILERO_FRAME_SAMPLES);
}

function syntheticTone(frames: number): Float32Array {
  const data = new Float32Array(frames * SILERO_FRAME_SAMPLES);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / 16_000);
  }
  return data;
}

async function loadOrtNode(): Promise<
  (SileroOrtLike & { InferenceSession: { create(path: string): Promise<unknown> } }) | null
> {
  try {
    const specifier = 'onnxruntime-node';
    return (await import(/* @vite-ignore */ specifier)) as never;
  } catch {
    return null;
  }
}

async function runReal(
  ort: SileroOrtLike,
  real: SileroSessionLike,
  drive: (
    handler: (event: MessageEvent) => Promise<void>,
    inputs: RealFrameInput[],
  ) => Promise<void>,
): Promise<RealFrameInput[]> {
  const inputs: RealFrameInput[] = [];
  const session: SileroSessionLike = {
    async run(feeds) {
      const state = feeds['state']?.data as Float32Array;
      const input = feeds['input']?.data as Float32Array;
      inputs.push({
        state: new Float32Array(state),
        context: new Float32Array(input.subarray(0, SILERO_CONTEXT_SAMPLES)),
      });
      return real.run(feeds);
    },
  };
  const handler = createVadWorkerHandler(() => undefined, {
    loadRuntime: async () => ({ ort, session }),
  });
  await handler(message({ type: 'init' }));
  await drive(handler, inputs);
  return inputs;
}

async function waitForInputs(inputs: RealFrameInput[], count: number): Promise<void> {
  const started = Date.now();
  while (inputs.length < count) {
    if (Date.now() - started > 10_000) {
      throw new Error(`timed out waiting for ${count} real frames, saw ${inputs.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
