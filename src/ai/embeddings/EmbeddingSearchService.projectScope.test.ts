// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, type EmbeddingDoc } from '../../db';
import { EmbeddingSearchService } from './EmbeddingSearchService';
import type { EmbeddingProvider } from './EmbeddingProvider';

/** P0-2 repro: embeddings must not leak across projects, and vectors of another dimension must not be scored. */
class FixedQuery implements EmbeddingProvider {
  readonly kind = 'local' as const;
  readonly label = 'FixedQuery';
  readonly modelId = 'm';
  async preload(): Promise<void> {}
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [1, 0]);
  }
  async isAvailable(): Promise<boolean> {
    return true;
  }
  terminate(): void {}
}

function row(
  textId: string,
  sourceType: EmbeddingDoc['sourceType'],
  sourceId: string,
  vector: number[],
): EmbeddingDoc {
  return {
    id: `${sourceType}::${sourceId}::m::v`,
    textId,
    sourceType,
    sourceId,
    model: 'm',
    modelVersion: 'v',
    contentHash: sourceId,
    vector,
    createdAt: new Date().toISOString(),
  };
}

describe('EmbeddingSearchService project scope (P0-2)', () => {
  beforeEach(async () => {
    await db.open();
    await db.embeddings.clear();
  });
  afterEach(async () => {
    await db.embeddings.clear();
  });

  it('searching project A never returns project B rows', async () => {
    await db.embeddings.bulkPut([
      row('proj_a', 'unit', 'a_unit', [0.9, 0.1]),
      row('proj_b', 'unit', 'b_unit', [1, 0]),
      row('proj_b', 'note', 'b_note', [1, 0]),
    ]);
    const service = new EmbeddingSearchService(new FixedQuery());
    const opts = { textId: 'proj_a', modelId: 'm', modelVersion: 'v' };

    const units = await service.searchSimilarUnits('q', opts);
    expect(units.matches.map((m) => m.sourceId)).toEqual(['a_unit']);

    const multi = await service.searchMultiSource('q', ['unit', 'note'], opts);
    expect(multi.matches.map((m) => m.sourceId)).toEqual(['a_unit']);
  });

  it('skips rows whose vector dimension differs from the query', async () => {
    await db.embeddings.bulkPut([
      row('proj_a', 'unit', 'same_dim', [0.6, 0.4]),
      row('proj_a', 'unit', 'other_dim', [1, 0, 0]),
    ]);
    const service = new EmbeddingSearchService(new FixedQuery());
    const result = await service.searchSimilarUnits('q', {
      textId: 'proj_a',
      modelId: 'm',
      modelVersion: 'v',
    });
    expect(result.matches.map((m) => m.sourceId)).toEqual(['same_dim']);
  });

  it('returns nothing without a project', async () => {
    await db.embeddings.bulkPut([row('proj_a', 'unit', 'a_unit', [1, 0])]);
    const service = new EmbeddingSearchService(new FixedQuery());
    const result = await service.searchSimilarUnits('q', {
      textId: '',
      modelId: 'm',
      modelVersion: 'v',
    });
    expect(result.matches).toEqual([]);
  });
});
