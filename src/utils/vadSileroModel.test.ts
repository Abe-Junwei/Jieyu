/**
 * 用仓库里的 Silero v6.2.3 模型（public/models/silero_vad.onnx）真跑一遍 v5+ 接口。
 * Runs the repo's Silero v6.2.3 model (public/models/silero_vad.onnx) through the v5+ interface.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createSileroStreamState,
  runSileroFrame,
  SILERO_CONTEXT_SAMPLES,
  SILERO_FRAME_SAMPLES,
  type SileroOrtLike,
  type SileroSessionLike,
} from './vadWorkerInferenceUtils';

const MODEL = join(process.cwd(), 'public/models/silero_vad.onnx');

async function loadOrtNode(): Promise<
  (SileroOrtLike & { InferenceSession: { create(path: string): Promise<unknown> } }) | null
> {
  try {
    // onnxruntime-node 是 transformers 的传递依赖；缺失时跳过 | transitive dep; skip when absent
    const specifier = 'onnxruntime-node';
    return (await import(/* @vite-ignore */ specifier)) as never;
  } catch {
    return null;
  }
}

describe('Silero VAD v5+ interface on the shipped model', () => {
  it('runs frames with input/state/sr and advances state and context', async () => {
    const ort = await loadOrtNode();
    if (!existsSync(MODEL)) return;
    expect(ort, 'onnxruntime-node (a transformers dependency) should be installed').not.toBeNull();
    if (!ort) return;
    const session = (await ort.InferenceSession.create(MODEL)) as SileroSessionLike;
    const stream = createSileroStreamState();

    const silence = new Float32Array(SILERO_FRAME_SAMPLES);
    const quiet = await runSileroFrame(ort, session, stream, silence);
    expect(quiet).toBeGreaterThanOrEqual(0);
    expect(quiet).toBeLessThan(0.2);

    const tone = Float32Array.from(
      { length: SILERO_FRAME_SAMPLES },
      (_, i) => 0.3 * Math.sin((2 * Math.PI * 220 * i) / 16_000),
    );
    const before = stream.state.slice();
    const prob = await runSileroFrame(ort, session, stream, tone);
    expect(Number.isFinite(prob)).toBe(true);
    expect(stream.state).not.toEqual(before);
    expect(stream.context).toEqual(tone.slice(SILERO_FRAME_SAMPLES - SILERO_CONTEXT_SAMPLES));
  });
});
