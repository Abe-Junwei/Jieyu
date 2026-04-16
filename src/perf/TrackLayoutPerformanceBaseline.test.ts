import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../db';
import { buildSpeakerLayerLayoutWithOptions } from '../utils/speakerLayerLayout';

function createSeededRandom(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1000000) / 1000000;
  };
}

function buildSyntheticUnits(count: number, speakerCount: number): LayerUnitDocType[] {
  const rand = createSeededRandom(20260324 + count + speakerCount);
  const now = new Date().toISOString();
  const rows: LayerUnitDocType[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.max(0, i * 0.18 + (rand() - 0.5) * 0.28);
    const duration = 0.12 + rand() * 1.65;
    const end = start + duration;
    rows.push({
      id: `utt_${i + 1}`,
      textId: 'text_perf',
      mediaId: 'media_perf',
      speakerId: `spk_${(i % speakerCount) + 1}`,
      startTime: Number(start.toFixed(3)),
      endTime: Number(end.toFixed(3)),
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType);
  }
  return rows;
}

function benchmarkLayoutMs(units: LayerUnitDocType[]): number {
  const speakerSortKeyById: Record<string, number> = {};
  const laneLockMap: Record<string, number> = {};
  for (let i = 1; i <= 24; i += 1) {
    speakerSortKeyById[`spk_${i}`] = i - 1;
    if (i % 3 === 0) laneLockMap[`spk_${i}`] = (i - 1) % 6;
  }

  const start = performance.now();
  buildSpeakerLayerLayoutWithOptions(units, {
    speakerSortKeyById,
    laneLockMap,
  });
  return performance.now() - start;
}

function benchmarkLayoutMedianMs(units: LayerUnitDocType[], runs = 3): { medianMs: number; samples: number[] } {
  benchmarkLayoutMs(units);

  const samples = Array.from({ length: runs }, () => benchmarkLayoutMs(units));
  const sorted = [...samples].sort((left, right) => left - right);
  const medianMs = sorted[Math.floor(sorted.length / 2)] ?? samples[0] ?? 0;

  return { medianMs, samples };
}

describe('Track layout performance baseline', () => {
  it('keeps 2k unit layout under baseline budget', () => {
    const units = buildSyntheticUnits(2000, 24);
    const { medianMs, samples } = benchmarkLayoutMedianMs(units);

    expect(medianMs).toBeLessThan(120);
    // eslint-disable-next-line no-console
    console.info('[Track Perf Baseline][2k]', {
      medianMs: Number(medianMs.toFixed(3)),
      samples: samples.map((value) => Number(value.toFixed(3))),
    });
  });

  it('keeps 5k unit layout under baseline budget', () => {
    const units = buildSyntheticUnits(5000, 32);
    const { medianMs, samples } = benchmarkLayoutMedianMs(units);

    expect(medianMs).toBeLessThan(260);
    // eslint-disable-next-line no-console
    console.info('[Track Perf Baseline][5k]', {
      medianMs: Number(medianMs.toFixed(3)),
      samples: samples.map((value) => Number(value.toFixed(3))),
    });
  });
});
