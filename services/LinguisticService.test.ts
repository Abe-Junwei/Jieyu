import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { TierDefinitionDocType, TierAnnotationDocType } from '../db';
import { LinguisticService, validateTierConstraints } from './LinguisticService';

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.texts.clear(),
    db.media_items.clear(),
    db.utterances.clear(),
    db.lexemes.clear(),
    db.annotations.clear(),
    db.corpus_lexicon_links.clear(),
    db.languages.clear(),
    db.speakers.clear(),
    db.orthographies.clear(),
    db.locations.clear(),
    db.bibliographic_sources.clear(),
    db.grammar_docs.clear(),
    db.abbreviations.clear(),
    db.phonemes.clear(),
    db.tag_definitions.clear(),
    db.translation_layers.clear(),
    db.utterance_translations.clear(),
    db.layer_links.clear(),
    db.tier_definitions.clear(),
    db.tier_annotations.clear(),
    db.audit_logs.clear(),
  ]);
}

describe('LinguisticService smoke tests', () => {
  beforeEach(async () => {
    await db.open();
    await clearDatabase();
  });

  it('can save utterance and query by media time', async () => {
    const now = new Date().toISOString();

    await LinguisticService.saveUtterance({
      id: 'utt_1',
      textId: 'text_1',
      transcription: { default: 'hello world' },
      startTime: 2.5,
      endTime: 6.5,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    const hit = await LinguisticService.getUtteranceAtTime(3.2);
    const miss = await LinguisticService.getUtteranceAtTime(9.9);

    expect(hit?.id).toBe('utt_1');
    expect(miss).toBeUndefined();
  });

  it('can persist translation layer and utterance translation linkage', async () => {
    const now = new Date().toISOString();

    await LinguisticService.saveTranslationLayer({
      id: 'layer_1',
      key: 'eng_free',
      name: { eng: 'English Free Translation' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      createdAt: now,
      updatedAt: now,
    });

    await LinguisticService.saveUtterance({
      id: 'utt_2',
      textId: 'text_1',
      transcription: { default: 'ni hao' },
      startTime: 0,
      endTime: 1,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await LinguisticService.saveUtteranceTranslation({
      id: 'utr_1',
      utteranceId: 'utt_2',
      translationLayerId: 'layer_1',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    });

    const layers = await LinguisticService.getTranslationLayers('translation');
    const records = await LinguisticService.getUtteranceTranslations('utt_2');

    expect(layers).toHaveLength(1);
    expect(layers[0]!.id).toBe('layer_1');
    expect(records).toHaveLength(1);
    expect(records[0]!.text).toBe('hello');
  });

  it('can export and re-import snapshot', async () => {
    const now = new Date().toISOString();

    await db.texts.put({
      id: 'text_2',
      title: { eng: 'Sample Text' },
      createdAt: now,
      updatedAt: now,
    });

    await LinguisticService.saveUtterance({
      id: 'utt_3',
      textId: 'text_2',
      transcription: { default: 'sample utterance' },
      startTime: 1,
      endTime: 2,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    const backup = await LinguisticService.exportToJSON();

    await db.utterances.clear();
    expect(await db.utterances.count()).toBe(0);

    const report = await LinguisticService.importFromJSON(backup, 'upsert');

    expect(report.collections.utterances?.written).toBeGreaterThan(0);
    expect(await db.utterances.count()).toBe(1);
  });
});

// ── Helpers for tier constraint tests ──────────────────────────

const NOW = '2025-01-01T00:00:00.000Z';

function makeTier(overrides: Partial<TierDefinitionDocType> & { id: string; textId: string; key: string }): TierDefinitionDocType {
  return {
    name: { default: overrides.key },
    tierType: 'time-aligned',
    contentType: 'transcription',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeAnn(overrides: Partial<TierAnnotationDocType> & { id: string; tierId: string }): TierAnnotationDocType {
  return {
    value: '',
    isVerified: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ── Pure constraint validation tests ───────────────────────────

describe('validateTierConstraints', () => {
  // T1: time-bounds
  it('T1 — rejects missing time on time-aligned annotation', () => {
    const tiers = [makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' })];
    const anns = [makeAnn({ id: 'a1', tierId: 't1' })]; // no startTime/endTime
    const v = validateTierConstraints(tiers, anns);
    expect(v.some((e) => e.rule === 'T1')).toBe(true);
  });

  it('T1 — rejects inverted time range', () => {
    const tiers = [makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' })];
    const anns = [makeAnn({ id: 'a1', tierId: 't1', startTime: 5, endTime: 2 })];
    const v = validateTierConstraints(tiers, anns);
    expect(v.some((e) => e.rule === 'T1')).toBe(true);
  });

  it('T1 — accepts valid time range', () => {
    const tiers = [makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' })];
    const anns = [makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 1 })];
    const v = validateTierConstraints(tiers, anns);
    expect(v.filter((e) => e.rule === 'T1')).toHaveLength(0);
  });

  // T2: no-overlap
  it('T2 — detects overlapping annotations on time-aligned tier', () => {
    const tiers = [makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' })];
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 3 }),
      makeAnn({ id: 'a2', tierId: 't1', startTime: 2, endTime: 5 }),
    ];
    const v = validateTierConstraints(tiers, anns);
    expect(v.some((e) => e.rule === 'T2')).toBe(true);
  });

  it('T2 — allows adjacent non-overlapping annotations', () => {
    const tiers = [makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' })];
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 2 }),
      makeAnn({ id: 'a2', tierId: 't1', startTime: 2, endTime: 4 }),
    ];
    const v = validateTierConstraints(tiers, anns);
    expect(v.filter((e) => e.rule === 'T2')).toHaveLength(0);
  });

  // T6: no-time-on-symbolic
  it('T6 — rejects time values on symbolic annotation', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' });
    const sym = makeTier({ id: 't2', textId: 'x', key: 'gloss', tierType: 'symbolic-association', parentTierId: 't1', contentType: 'gloss' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 1 }),
      makeAnn({ id: 'a2', tierId: 't2', parentAnnotationId: 'a1', startTime: 0, endTime: 1 }),
    ];
    const v = validateTierConstraints([root, sym], anns);
    expect(v.some((e) => e.rule === 'T6')).toBe(true);
  });

  // S1: parent-annotation-exists
  it('S1 — rejects missing parentAnnotationId on child tier', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' });
    const child = makeTier({ id: 't2', textId: 'x', key: 'morph', tierType: 'symbolic-subdivision', parentTierId: 't1' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 1 }),
      makeAnn({ id: 'a2', tierId: 't2', ordinal: 0 }), // missing parentAnnotationId
    ];
    const v = validateTierConstraints([root, child], anns);
    expect(v.some((e) => e.rule === 'S1')).toBe(true);
  });

  it('S1 — rejects reference to non-existent parent annotation', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' });
    const child = makeTier({ id: 't2', textId: 'x', key: 'morph', tierType: 'symbolic-subdivision', parentTierId: 't1' });
    const anns = [
      makeAnn({ id: 'a2', tierId: 't2', parentAnnotationId: 'ghost', ordinal: 0 }),
    ];
    const v = validateTierConstraints([root, child], anns);
    expect(v.some((e) => e.rule === 'S1')).toBe(true);
  });

  // S2: tier-type-match
  it('S2 — rejects parent annotation from wrong tier', () => {
    const t1 = makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' });
    const t2 = makeTier({ id: 't2', textId: 'x', key: 'other', tierType: 'time-aligned' });
    const child = makeTier({ id: 't3', textId: 'x', key: 'morph', tierType: 'symbolic-subdivision', parentTierId: 't1' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't2', startTime: 0, endTime: 1 }), // belongs to t2, not t1
      makeAnn({ id: 'a2', tierId: 't3', parentAnnotationId: 'a1', ordinal: 0 }),
    ];
    const v = validateTierConstraints([t1, t2, child], anns);
    expect(v.some((e) => e.rule === 'S2')).toBe(true);
  });

  // S3: one-to-one for symbolic-association
  it('S3 — rejects multiple children on symbolic-association for same parent', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' });
    const assoc = makeTier({ id: 't2', textId: 'x', key: 'pos', tierType: 'symbolic-association', parentTierId: 't1', contentType: 'pos' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 1 }),
      makeAnn({ id: 'a2', tierId: 't2', parentAnnotationId: 'a1' }),
      makeAnn({ id: 'a3', tierId: 't2', parentAnnotationId: 'a1' }),
    ];
    const v = validateTierConstraints([root, assoc], anns);
    expect(v.some((e) => e.rule === 'S3')).toBe(true);
  });

  // S5: tier-dag-acyclic
  it('S5 — detects cycle in tier parent references', () => {
    const t1 = makeTier({ id: 't1', textId: 'x', key: 'a', tierType: 'symbolic-subdivision', parentTierId: 't2' });
    const t2 = makeTier({ id: 't2', textId: 'x', key: 'b', tierType: 'symbolic-subdivision', parentTierId: 't1' });
    const v = validateTierConstraints([t1, t2], []);
    expect(v.some((e) => e.rule === 'S5')).toBe(true);
  });

  // S6: tier-parent-type-compatible
  it('S6 — rejects time-subdivision under symbolic-association parent', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'symbolic-association' });
    const child = makeTier({ id: 't2', textId: 'x', key: 'sub', tierType: 'time-subdivision', parentTierId: 't1' });
    const v = validateTierConstraints([root, child], []);
    expect(v.some((e) => e.rule === 'S6')).toBe(true);
  });

  it('S6 — allows symbolic-subdivision under time-aligned', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'root', tierType: 'time-aligned' });
    const child = makeTier({ id: 't2', textId: 'x', key: 'morph', tierType: 'symbolic-subdivision', parentTierId: 't1' });
    const v = validateTierConstraints([root, child], []);
    expect(v.filter((e) => e.rule === 'S6')).toHaveLength(0);
  });

  // R1: tier-parent-valid
  it('R1 — rejects reference to non-existent parent tier', () => {
    const t = makeTier({ id: 't1', textId: 'x', key: 'child', tierType: 'time-subdivision', parentTierId: 'ghost' });
    const v = validateTierConstraints([t], []);
    expect(v.some((e) => e.rule === 'R1')).toBe(true);
  });

  // R2: annotation-tier-valid
  it('R2 — rejects annotation referencing non-existent tier', () => {
    const anns = [makeAnn({ id: 'a1', tierId: 'ghost', startTime: 0, endTime: 1 })];
    const v = validateTierConstraints([], anns);
    expect(v.some((e) => e.rule === 'R2')).toBe(true);
  });

  // T3: subdivision-within-parent
  it('T3 — rejects subdivision annotation outside parent time range', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'utt', tierType: 'time-aligned' });
    const sub = makeTier({ id: 't2', textId: 'x', key: 'word', tierType: 'time-subdivision', parentTierId: 't1' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 5 }),
      makeAnn({ id: 'a2', tierId: 't2', parentAnnotationId: 'a1', startTime: 3, endTime: 7 }), // exceeds parent
    ];
    const v = validateTierConstraints([root, sub], anns);
    expect(v.some((e) => e.rule === 'T3')).toBe(true);
  });

  it('T3 — accepts subdivision within parent bounds', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'utt', tierType: 'time-aligned' });
    const sub = makeTier({ id: 't2', textId: 'x', key: 'word', tierType: 'time-subdivision', parentTierId: 't1' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 5 }),
      makeAnn({ id: 'a2', tierId: 't2', parentAnnotationId: 'a1', startTime: 0, endTime: 3 }),
      makeAnn({ id: 'a3', tierId: 't2', parentAnnotationId: 'a1', startTime: 3, endTime: 5 }),
    ];
    const v = validateTierConstraints([root, sub], anns);
    expect(v.filter((e) => e.rule === 'T3')).toHaveLength(0);
  });

  // T4: subdivision-full-coverage (warning)
  it('T4 — warns when subdivisions do not fully cover parent span', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'utt', tierType: 'time-aligned' });
    const sub = makeTier({ id: 't2', textId: 'x', key: 'word', tierType: 'time-subdivision', parentTierId: 't1' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 10 }),
      makeAnn({ id: 'a2', tierId: 't2', parentAnnotationId: 'a1', startTime: 0, endTime: 5 }),
      // gap from 5 to 10
    ];
    const v = validateTierConstraints([root, sub], anns);
    expect(v.some((e) => e.rule === 'T4' && e.severity === 'warning')).toBe(true);
  });

  it('T4 — no warning when subdivisions fully cover parent', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'utt', tierType: 'time-aligned' });
    const sub = makeTier({ id: 't2', textId: 'x', key: 'word', tierType: 'time-subdivision', parentTierId: 't1' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 10 }),
      makeAnn({ id: 'a2', tierId: 't2', parentAnnotationId: 'a1', startTime: 0, endTime: 5 }),
      makeAnn({ id: 'a3', tierId: 't2', parentAnnotationId: 'a1', startTime: 5, endTime: 10 }),
    ];
    const v = validateTierConstraints([root, sub], anns);
    expect(v.filter((e) => e.rule === 'T4')).toHaveLength(0);
  });

  // T5: subdivision-no-overlap
  it('T5 — rejects overlapping subdivisions under the same parent', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'utt', tierType: 'time-aligned' });
    const sub = makeTier({ id: 't2', textId: 'x', key: 'word', tierType: 'time-subdivision', parentTierId: 't1' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 10 }),
      makeAnn({ id: 'a2', tierId: 't2', parentAnnotationId: 'a1', startTime: 0, endTime: 6 }),
      makeAnn({ id: 'a3', tierId: 't2', parentAnnotationId: 'a1', startTime: 4, endTime: 10 }),
    ];
    const v = validateTierConstraints([root, sub], anns);
    expect(v.some((e) => e.rule === 'T5')).toBe(true);
  });

  it('T5 — accepts non-overlapping subdivisions under the same parent', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'utt', tierType: 'time-aligned' });
    const sub = makeTier({ id: 't2', textId: 'x', key: 'word', tierType: 'time-subdivision', parentTierId: 't1' });
    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 10 }),
      makeAnn({ id: 'a2', tierId: 't2', parentAnnotationId: 'a1', startTime: 0, endTime: 5 }),
      makeAnn({ id: 'a3', tierId: 't2', parentAnnotationId: 'a1', startTime: 5, endTime: 10 }),
    ];
    const v = validateTierConstraints([root, sub], anns);
    expect(v.filter((e) => e.rule === 'T5')).toHaveLength(0);
  });

  // L4: morph-gloss alignment
  it('L4 — warns when gloss count does not match morpheme count', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'utt', tierType: 'time-aligned' });
    const morph = makeTier({ id: 't2', textId: 'x', key: 'morph', tierType: 'symbolic-subdivision', parentTierId: 't1' });
    const gloss = makeTier({ id: 't3', textId: 'x', key: 'gloss', tierType: 'symbolic-association', parentTierId: 't2', contentType: 'gloss' });

    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 2 }),
      makeAnn({ id: 'm1', tierId: 't2', parentAnnotationId: 'a1', ordinal: 0 }),
      makeAnn({ id: 'm2', tierId: 't2', parentAnnotationId: 'a1', ordinal: 1 }),
      makeAnn({ id: 'm3', tierId: 't2', parentAnnotationId: 'a1', ordinal: 2 }),
      // Only 2 glosses for 3 morphemes
      makeAnn({ id: 'g1', tierId: 't3', parentAnnotationId: 'm1' }),
      makeAnn({ id: 'g2', tierId: 't3', parentAnnotationId: 'm2' }),
    ];

    const v = validateTierConstraints([root, morph, gloss], anns);
    expect(v.some((e) => e.rule === 'L4' && e.severity === 'warning')).toBe(true);
  });

  it('L4 — no warning when gloss count matches morpheme count', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'utt', tierType: 'time-aligned' });
    const morph = makeTier({ id: 't2', textId: 'x', key: 'morph', tierType: 'symbolic-subdivision', parentTierId: 't1' });
    const gloss = makeTier({ id: 't3', textId: 'x', key: 'gloss', tierType: 'symbolic-association', parentTierId: 't2', contentType: 'gloss' });

    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 2 }),
      makeAnn({ id: 'm1', tierId: 't2', parentAnnotationId: 'a1', ordinal: 0 }),
      makeAnn({ id: 'm2', tierId: 't2', parentAnnotationId: 'a1', ordinal: 1 }),
      makeAnn({ id: 'g1', tierId: 't3', parentAnnotationId: 'm1' }),
      makeAnn({ id: 'g2', tierId: 't3', parentAnnotationId: 'm2' }),
    ];

    const v = validateTierConstraints([root, morph, gloss], anns);
    expect(v.filter((e) => e.rule === 'L4')).toHaveLength(0);
  });

  // Happy path: valid 3-level ELAN-style hierarchy
  it('accepts valid 3-level time→subdivision→association hierarchy', () => {
    const root = makeTier({ id: 't1', textId: 'x', key: 'utterance', tierType: 'time-aligned' });
    const morph = makeTier({ id: 't2', textId: 'x', key: 'morph', tierType: 'symbolic-subdivision', parentTierId: 't1' });
    const gloss = makeTier({ id: 't3', textId: 'x', key: 'gloss', tierType: 'symbolic-association', parentTierId: 't2', contentType: 'gloss' });

    const anns = [
      makeAnn({ id: 'a1', tierId: 't1', startTime: 0, endTime: 2 }),
      makeAnn({ id: 'a2', tierId: 't1', startTime: 2, endTime: 4 }),
      makeAnn({ id: 'm1', tierId: 't2', parentAnnotationId: 'a1', ordinal: 0 }),
      makeAnn({ id: 'm2', tierId: 't2', parentAnnotationId: 'a1', ordinal: 1 }),
      makeAnn({ id: 'g1', tierId: 't3', parentAnnotationId: 'm1' }),
      makeAnn({ id: 'g2', tierId: 't3', parentAnnotationId: 'm2' }),
    ];

    const v = validateTierConstraints([root, morph, gloss], anns);
    expect(v.filter((e) => e.severity === 'error')).toHaveLength(0);
  });
});

// ── Integration tests: tier CRUD + batch save ──────────────────

describe('Tier CRUD & batch save', () => {
  beforeEach(async () => {
    await db.open();
    await clearDatabase();
  });

  it('can save and retrieve tier definitions', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'utterance', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);
    const result = await LinguisticService.getTierDefinitions('text_1');
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe('utterance');
  });

  it('saveTierAnnotationsBatch rejects invalid annotations', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);

    // overlapping annotations → T2 violation
    const anns = [
      makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 3 }),
      makeAnn({ id: 'a2', tierId: 'td1', startTime: 2, endTime: 5 }),
    ];

    const { violations } = await LinguisticService.saveTierAnnotationsBatch('text_1', anns);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.rule === 'T2')).toBe(true);

    // Annotations should NOT have been persisted
    const stored = await LinguisticService.getTierAnnotations('td1');
    expect(stored).toHaveLength(0);
  });

  it('saveTierAnnotationsBatch persists valid annotations', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);

    const anns = [
      makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 2 }),
      makeAnn({ id: 'a2', tierId: 'td1', startTime: 2, endTime: 4 }),
    ];

    const { violations } = await LinguisticService.saveTierAnnotationsBatch('text_1', anns);
    expect(violations).toHaveLength(0);

    const stored = await LinguisticService.getTierAnnotations('td1');
    expect(stored).toHaveLength(2);
  });
});

// ── Audit log tests ────────────────────────────────────────────

describe('Audit logging', () => {
  beforeEach(async () => {
    await db.open();
    await clearDatabase();
  });

  it('logs create action when saving a new tier definition', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier, 'human');

    const logs = await LinguisticService.getAuditLogs('td1');
    expect(logs).toHaveLength(1);
    expect(logs[0]!.action).toBe('create');
    expect(logs[0]!.collection).toBe('tier_definitions');
    expect(logs[0]!.source).toBe('human');
  });

  it('logs field-level changes when updating a tier annotation', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);

    const ann = makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 2, value: 'hello' });
    await LinguisticService.saveTierAnnotation(ann, 'human');

    // Update the annotation value
    const updated = { ...ann, value: 'world', updatedAt: new Date().toISOString() };
    await LinguisticService.saveTierAnnotation(updated, 'ai');

    const logs = await LinguisticService.getAuditLogs('a1');
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const createLog = logs.find((l) => l.action === 'create');
    expect(createLog).toBeDefined();

    const updateLog = logs.find((l) => l.action === 'update' && l.field === 'value');
    expect(updateLog).toBeDefined();
    expect(updateLog!.oldValue).toBe('hello');
    expect(updateLog!.newValue).toBe('world');
    expect(updateLog!.source).toBe('ai');
  });

  it('logs delete action when removing a tier annotation', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);

    const ann = makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 2 });
    await LinguisticService.saveTierAnnotation(ann);
    await LinguisticService.removeTierAnnotation('a1', 'human');

    const logs = await LinguisticService.getAuditLogs('a1');
    const deleteLog = logs.find((l) => l.action === 'delete');
    expect(deleteLog).toBeDefined();
    expect(deleteLog!.collection).toBe('tier_annotations');
  });

  it('does not log when tracked fields are unchanged', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);

    const ann = makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 2, value: 'same' });
    await LinguisticService.saveTierAnnotation(ann);

    // Re-save with same tracked fields (only updatedAt changes, which is not tracked)
    const resaved = { ...ann, updatedAt: new Date().toISOString() };
    await LinguisticService.saveTierAnnotation(resaved);

    const logs = await LinguisticService.getAuditLogs('a1');
    // Should have only the create log, no update log
    expect(logs.every((l) => l.action === 'create')).toBe(true);
  });

  it('logs multiple field changes as separate entries', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);

    const ann = makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 2, value: 'hi' });
    await LinguisticService.saveTierAnnotation(ann);

    const updated = { ...ann, value: 'bye', startTime: 1, endTime: 3, updatedAt: new Date().toISOString() };
    await LinguisticService.saveTierAnnotation(updated);

    const logs = await LinguisticService.getAuditLogs('a1');
    const updateLogs = logs.filter((l) => l.action === 'update');
    const changedFields = updateLogs.map((l) => l.field).sort();
    expect(changedFields).toEqual(['endTime', 'startTime', 'value']);
  });

  it('getAuditLogsByCollection filters by collection', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);

    const ann = makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 2 });
    await LinguisticService.saveTierAnnotation(ann);

    const tierDefLogs = await LinguisticService.getAuditLogsByCollection('tier_definitions');
    const tierAnnLogs = await LinguisticService.getAuditLogsByCollection('tier_annotations');

    expect(tierDefLogs.every((l) => l.collection === 'tier_definitions')).toBe(true);
    expect(tierAnnLogs.every((l) => l.collection === 'tier_annotations')).toBe(true);
    expect(tierDefLogs.length).toBeGreaterThan(0);
    expect(tierAnnLogs.length).toBeGreaterThan(0);
  });

  it('saveTierAnnotationsBatch generates audit logs for each annotation', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);

    const anns = [
      makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 2 }),
      makeAnn({ id: 'a2', tierId: 'td1', startTime: 2, endTime: 4 }),
    ];

    await LinguisticService.saveTierAnnotationsBatch('text_1', anns);

    const logs1 = await LinguisticService.getAuditLogs('a1');
    const logs2 = await LinguisticService.getAuditLogs('a2');
    expect(logs1.some((l) => l.action === 'create')).toBe(true);
    expect(logs2.some((l) => l.action === 'create')).toBe(true);
  });
});
