import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveRecoverySnapshot,
  getRecoverySnapshot,
  clearRecoverySnapshot,
} from '../src/services/SnapshotService';
import type {
  UtteranceDocType,
  UtteranceTextDocType,
  TranslationLayerDocType,
} from '../db';

// ── Helpers ──────────────────────────────────────────────────

function makeUtterances(count: number): UtteranceDocType[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `utt_${i}`,
    textId: 'text1',
    mediaId: 'media1',
    startTime: i,
    endTime: i + 1,
    isVerified: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }));
}

function makeTranslation(uttId: string, layerId: string): UtteranceTextDocType {
  return {
    id: `utr_${uttId}_${layerId}`,
    utteranceId: uttId,
    tierId: layerId,
    modality: 'text',
    text: `translation for ${uttId}`,
    sourceType: 'human',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeLayer(id: string): TranslationLayerDocType {
  return {
    id,
    textId: 'text_1',
    key: `layer_${id}`,
    name: { eng: `Layer ${id}` },
    layerType: 'translation',
    languageId: 'en',
    modality: 'text',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('SnapshotService', () => {
  const DB_NAME = 'testdb_snapshot';

  beforeEach(async () => {
    await clearRecoverySnapshot(DB_NAME);
  });

  it('returns null when no snapshot exists', async () => {
    const result = await getRecoverySnapshot(DB_NAME);
    expect(result).toBeNull();
  });

  it('saves and retrieves a snapshot', async () => {
    const utterances = makeUtterances(3);
    const translations = [makeTranslation('utt_0', 'l1')];
    const layers = [makeLayer('l1')];

    await saveRecoverySnapshot(DB_NAME, { utterances, translations, layers });
    const snapshot = await getRecoverySnapshot(DB_NAME);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.utterances).toHaveLength(3);
    expect(snapshot!.utterances[0]!.id).toBe('utt_0');
    expect(snapshot!.translations).toHaveLength(1);
    expect(snapshot!.translations[0]!.text).toBe('translation for utt_0');
    expect(snapshot!.layers).toHaveLength(1);
    expect(snapshot!.layers[0]!.key).toBe('layer_l1');
    expect(snapshot!.schemaVersion).toBe(1);
    expect(snapshot!.timestamp).toBeGreaterThan(0);
  });

  it('overwrites a previous snapshot for the same dbName', async () => {
    await saveRecoverySnapshot(DB_NAME, {
      utterances: makeUtterances(2),
      translations: [],
      layers: [],
    });
    await saveRecoverySnapshot(DB_NAME, {
      utterances: makeUtterances(5),
      translations: [],
      layers: [],
    });

    const snapshot = await getRecoverySnapshot(DB_NAME);
    expect(snapshot!.utterances).toHaveLength(5);
  });

  it('clears a snapshot', async () => {
    await saveRecoverySnapshot(DB_NAME, {
      utterances: makeUtterances(1),
      translations: [],
      layers: [],
    });
    await clearRecoverySnapshot(DB_NAME);
    const result = await getRecoverySnapshot(DB_NAME);
    expect(result).toBeNull();
  });

  it('keeps snapshots isolated by dbName', async () => {
    await saveRecoverySnapshot('db_a', {
      utterances: makeUtterances(2),
      translations: [],
      layers: [],
    });
    await saveRecoverySnapshot('db_b', {
      utterances: makeUtterances(7),
      translations: [],
      layers: [],
    });

    const a = await getRecoverySnapshot('db_a');
    const b = await getRecoverySnapshot('db_b');
    expect(a!.utterances).toHaveLength(2);
    expect(b!.utterances).toHaveLength(7);

    // Cleanup
    await clearRecoverySnapshot('db_a');
    await clearRecoverySnapshot('db_b');
  });

  it('preserves complex data through JSON serialization', async () => {
    const utterances = makeUtterances(1);
    utterances[0]!.tags = { verified: true, needs_review: false };

    await saveRecoverySnapshot(DB_NAME, {
      utterances,
      translations: [],
      layers: [],
    });

    const snapshot = await getRecoverySnapshot(DB_NAME);
    expect(snapshot!.utterances[0]!.tags).toEqual({ verified: true, needs_review: false });
  });
});
