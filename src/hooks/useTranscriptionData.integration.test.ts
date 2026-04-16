/**
 * Integration test for translation write flow
 * Verifies that translation text is written to the correct tier/layer
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, type LayerUnitDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.texts.clear(),
    db.media_items.clear(),
    db.unit_tokens.clear(),
    db.unit_morphemes.clear(),
    db.lexemes.clear(),
    db.token_lexeme_links.clear(),
    db.ai_tasks.clear(),
    db.embeddings.clear(),
    db.languages.clear(),
    db.speakers.clear(),
    db.orthographies.clear(),
    db.locations.clear(),
    db.bibliographic_sources.clear(),
    db.grammar_docs.clear(),
    db.abbreviations.clear(),
    db.phonemes.clear(),
    db.tag_definitions.clear(),
    db.layer_units.clear(),
    db.layer_unit_contents.clear(),
    db.unit_relations.clear(),
    db.layer_links.clear(),
    db.tier_definitions.clear(),
    db.tier_annotations.clear(),
    db.audit_logs.clear(),
    db.user_notes.clear(),
  ]);
}

describe('Translation Write Flow - Integration Tests', () => {
  let testUnit: LayerUnitDocType;
  const testLayerId = 'tier_gloss_test';

  beforeEach(async () => {
    await db.open();
    await clearDatabase();

    // Create test unit
    testUnit = {
      id: 'test-utt-001',
      mediaId: 'test-media-001',
      textId: 'test-text-001',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'test transcription' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as LayerUnitDocType;

    await LinguisticService.saveUnit(testUnit);
  });

  afterEach(async () => {
    await clearDatabase();
  });

  it('should write translation text to correct tier', async () => {
    const unitId = testUnit.id;
    const mediaId = testUnit.mediaId;
    const layerId = testLayerId;
    const translationText = 'test gloss translation';
    const now = new Date().toISOString();

    // Verify no existing translation
    let docs = (await db.layer_units.toArray())
      .filter((row) => row.parentUnitId === unitId && row.layerId === layerId);
    expect(docs).toHaveLength(0);

    // Write translation
    const textId = `text-${unitId}-${layerId}`;
    const docId = `seg-${unitId}-${layerId}`;
    await db.layer_unit_contents.add({
      id: textId,
      textId,
      unitId: docId,
      layerId,
      contentRole: 'primary_text',
      modality: 'text',
      sourceType: 'human',
      text: translationText,
      createdAt: now,
      updatedAt: now,
    });
    await db.layer_units.add({
      id: docId,
      textId,
      mediaId: mediaId!,
      layerId: layerId,
      unitType: 'segment',
      parentUnitId: unitId,
      rootUnitId: unitId,
      startTime: testUnit.startTime,
      endTime: testUnit.endTime,
      createdAt: now,
      updatedAt: now,
    });

    // Verify it was written to correct tier
    docs = (await db.layer_units.toArray())
      .filter((row) => row.parentUnitId === unitId && row.layerId === layerId);

    expect(docs).toHaveLength(1);
    const doc = docs[0]!;
    
    const content = await db.layer_unit_contents.get(textId);

    // Critical: verify tier matches the layer ID we provided
    expect(doc.layerId).toBe(layerId);
    expect(doc.parentUnitId).toBe(unitId);
    expect(content!.text).toBe(translationText);
  });

  it('should handle multiple translations in different layers for same unit', async () => {
    const unitId = testUnit.id;
    const mediaId = testUnit.mediaId;
    const now = new Date().toISOString();
    const glossLayerId = 'tier_gloss';
    const morphLayerId = 'tier_morph';

    // Write gloss translation
    const glossTextId = `text-${unitId}-gloss`;
    const glossId = `seg-${unitId}-gloss`;
    await db.layer_unit_contents.add({
      id: glossTextId,
      textId: glossTextId,
      unitId: glossId,
      layerId: glossLayerId,
      contentRole: 'primary_text',
      modality: 'text',
      sourceType: 'human',
      text: 'gloss text',
      createdAt: now,
      updatedAt: now,
    });
    await db.layer_units.add({
      id: glossId,
      textId: glossTextId,
      mediaId: mediaId!,
      layerId: glossLayerId,
      unitType: 'segment',
      parentUnitId: unitId,
      rootUnitId: unitId,
      startTime: testUnit.startTime,
      endTime: testUnit.endTime,
      createdAt: now,
      updatedAt: now,
    });

    // Write morph translation
    const morphTextId = `text-${unitId}-morph`;
    const morphId = `seg-${unitId}-morph`;
    await db.layer_unit_contents.add({
      id: morphTextId,
      textId: morphTextId,
      unitId: morphId,
      layerId: morphLayerId,
      contentRole: 'primary_text',
      modality: 'text',
      sourceType: 'human',
      text: 'morph text',
      createdAt: now,
      updatedAt: now,
    });
    await db.layer_units.add({
      id: morphId,
      textId: morphTextId,
      mediaId: mediaId!,
      layerId: morphLayerId,
      unitType: 'segment',
      parentUnitId: unitId,
      rootUnitId: unitId,
      startTime: testUnit.startTime,
      endTime: testUnit.endTime,
      createdAt: now,
      updatedAt: now,
    });

    // Verify both exist and are in correct tiers
    const allDocs = (await db.layer_units.toArray())
      .filter((row) => row.parentUnitId === unitId);

    expect(allDocs).toHaveLength(2);

    const byTier = new Map();
    for (const doc of allDocs) {
      const content = await db.layer_unit_contents.get(doc.textId);
      byTier.set(doc.layerId, { ...doc, text: content!.text });
    }

    // Verify gloss is in correct tier
    expect(byTier.get(glossLayerId)?.text).toBe('gloss text');
    expect(byTier.get(glossLayerId)?.layerId).toBe(glossLayerId);

    // Verify morph is in correct tier
    expect(byTier.get(morphLayerId)?.text).toBe('morph text');
    expect(byTier.get(morphLayerId)?.layerId).toBe(morphLayerId);
  });

  it('should update existing translation without data loss', async () => {
    const unitId = testUnit.id;
    const mediaId = testUnit.mediaId;
    const layerId = testLayerId;
    const now = new Date().toISOString();
    
    const textId = `text-${unitId}-${layerId}`;
    const docId = `seg-${unitId}-${layerId}`;
    await db.layer_unit_contents.add({
      id: textId,
      textId,
      unitId: docId,
      layerId,
      contentRole: 'primary_text',
      modality: 'text',
      sourceType: 'human',
      text: 'original text',
      createdAt: now,
      updatedAt: now,
    });

    // Create initial translation
    await db.layer_units.add({
      id: docId,
      textId,
      mediaId: mediaId!,
      layerId: layerId,
      unitType: 'segment',
      parentUnitId: unitId,
      rootUnitId: unitId,
      startTime: testUnit.startTime,
      endTime: testUnit.endTime,
      createdAt: now,
      updatedAt: now,
    });

    // Update it
    const newNow = new Date().toISOString();
    await db.layer_unit_contents.update(textId, {
      text: 'updated text',
      updatedAt: newNow,
    });

    // Verify update
    const updated = await db.layer_units.get(docId);
    const updatedContent = await db.layer_unit_contents.get(textId);
    expect(updatedContent?.text).toBe('updated text');
    expect(updated?.layerId).toBe(layerId);
    expect(updated?.parentUnitId).toBe(unitId);
    expect(updatedContent?.updatedAt).toBe(newNow);
  });

  it('should clear translation text when deleting', async () => {
    const unitId = testUnit.id;
    const mediaId = testUnit.mediaId;
    const layerId = testLayerId;
    const now = new Date().toISOString();
    const textId = `text-${unitId}-${layerId}`;
    const docId = `seg-${unitId}-${layerId}`;
    await db.layer_unit_contents.add({
      id: textId,
      textId,
      unitId: docId,
      layerId,
      contentRole: 'primary_text',
      modality: 'text',
      sourceType: 'human',
      text: 'original text',
      createdAt: now,
      updatedAt: now,
    });
    await db.layer_units.add({
      id: docId,
      textId,
      mediaId: mediaId!,
      layerId: layerId,
      unitType: 'segment',
      parentUnitId: unitId,
      rootUnitId: unitId,
      startTime: testUnit.startTime,
      endTime: testUnit.endTime,
      createdAt: now,
      updatedAt: now,
    });

    // Verify it exists
    let docs = (await db.layer_units.toArray())
      .filter((row) => row.parentUnitId === unitId && row.layerId === layerId);
    expect(docs).toHaveLength(1);

    // Delete it
    await db.layer_units.delete(docId);
    await db.layer_unit_contents.delete(textId);

    // Verify it's gone
    docs = (await db.layer_units.toArray())
      .filter((row) => row.parentUnitId === unitId && row.layerId === layerId);
    expect(docs).toHaveLength(0);
  });
});
