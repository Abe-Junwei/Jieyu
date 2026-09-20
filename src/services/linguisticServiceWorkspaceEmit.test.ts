// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { LinguisticService } from './LinguisticService';
import * as workspaceEvents from '../utils/workspaceEvents';

const now = '2026-09-20T10:00:00.000Z';

async function seedTranscriptionLayer(textId: string, layerId: string): Promise<void> {
  await db.texts.put({
    id: textId,
    title: { default: 'Fixture' },
    createdAt: now,
    updatedAt: now,
  });
  await LinguisticService.layers.saveTranslation({
    id: layerId,
    textId,
    key: `trc_${textId}`,
    name: { default: 'TRC' },
    layerType: 'transcription',
    languageId: 'und',
    modality: 'text',
    isDefault: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  });
}

describe('B2 workspace emit completeness', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      db.texts.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_tokens.clear(),
      db.unit_morphemes.clear(),
      db.token_lexeme_links.clear(),
      db.user_notes.clear(),
      db.lexemes.clear(),
    ]);
    await seedTranscriptionLayer('text-emit', 'layer-emit');
  });

  it('saveUnitsBatch emits once per unique unitId after persist', async () => {
    const unitUpdated = vi.spyOn(workspaceEvents, 'dispatchWorkspaceUnitUpdated');
    const unit = {
      id: 'unit-a',
      textId: 'text-emit',
      mediaId: 'media-emit',
      startTime: 0,
      endTime: 1,
      annotationStatus: 'raw' as const,
      createdAt: now,
      updatedAt: now,
    };
    await LinguisticService.units.saveBatch([unit, { ...unit, endTime: 2 }, unit]);

    const stored = await LinguisticService.units.listByTextId('text-emit');
    expect(stored.find((row) => row.id === 'unit-a')).toBeDefined();
    const unitCalls = unitUpdated.mock.calls.filter((call) => call[0]?.unitId === 'unit-a');
    expect(unitCalls).toHaveLength(1);
  });

  it('saveTokenLexemeLink emits unit-updated and lexeme-updated', async () => {
    await LinguisticService.units.save({
      id: 'unit-link',
      textId: 'text-emit',
      mediaId: 'media-emit',
      startTime: 0,
      endTime: 1,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    });
    await LinguisticService.units.saveToken({
      id: 'tok-link',
      textId: 'text-emit',
      unitId: 'unit-link',
      tokenIndex: 0,
      form: { default: 'dog' },
      createdAt: now,
      updatedAt: now,
    });
    const unitUpdated = vi.spyOn(workspaceEvents, 'dispatchWorkspaceUnitUpdated');
    const lexemeUpdated = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeUpdated');

    await LinguisticService.units.saveTokenLexemeLink({
      id: 'link-1',
      targetType: 'token',
      targetId: 'tok-link',
      lexemeId: 'lex-dog',
      createdAt: now,
      updatedAt: now,
    });

    expect(unitUpdated).toHaveBeenCalledWith({ unitId: 'unit-link' });
    expect(lexemeUpdated).toHaveBeenCalledWith({ lexemeId: 'lex-dog' });
  });

  it('removeTokenLexemeLinks emits after looking up the stored link', async () => {
    await LinguisticService.units.saveToken({
      id: 'tok-rm',
      textId: 'text-emit',
      unitId: 'unit-rm',
      tokenIndex: 0,
      form: { default: 'cat' },
      createdAt: now,
      updatedAt: now,
    });
    await LinguisticService.units.saveTokenLexemeLink({
      id: 'link-rm',
      targetType: 'token',
      targetId: 'tok-rm',
      lexemeId: 'lex-cat',
      createdAt: now,
      updatedAt: now,
    });
    const unitUpdated = vi.spyOn(workspaceEvents, 'dispatchWorkspaceUnitUpdated');
    const lexemeUpdated = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeUpdated');

    await LinguisticService.units.removeTokenLexemeLinks('token', 'tok-rm');

    expect(await LinguisticService.units.listTokenLexemeLinks('token', 'tok-rm')).toHaveLength(0);
    expect(unitUpdated).toHaveBeenCalledWith({ unitId: 'unit-rm' });
    expect(lexemeUpdated).toHaveBeenCalledWith({ lexemeId: 'lex-cat' });
  });

  it('removeTokenLexemeLinksByIds emits for remaining stored rows', async () => {
    await LinguisticService.units.saveMorpheme({
      id: 'mor-rm',
      textId: 'text-emit',
      unitId: 'unit-mor',
      tokenId: 'tok-mor',
      morphemeIndex: 0,
      form: { default: 'stem' },
      createdAt: now,
      updatedAt: now,
    });
    await LinguisticService.units.saveTokenLexemeLink({
      id: 'link-mor',
      targetType: 'morpheme',
      targetId: 'mor-rm',
      lexemeId: 'lex-stem',
      createdAt: now,
      updatedAt: now,
    });
    const unitUpdated = vi.spyOn(workspaceEvents, 'dispatchWorkspaceUnitUpdated');
    const lexemeUpdated = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeUpdated');

    await LinguisticService.units.removeTokenLexemeLinksByIds(['link-mor']);

    expect(unitUpdated).toHaveBeenCalledWith({ unitId: 'unit-mor' });
    expect(lexemeUpdated).toHaveBeenCalledWith({ lexemeId: 'lex-stem' });
  });

  it('saveUserNote emits unit-updated for unit and token notes', async () => {
    await LinguisticService.units.saveToken({
      id: 'tok-note',
      textId: 'text-emit',
      unitId: 'unit-note',
      tokenIndex: 0,
      form: { default: 'x' },
      createdAt: now,
      updatedAt: now,
    });
    const unitUpdated = vi.spyOn(workspaceEvents, 'dispatchWorkspaceUnitUpdated');

    await LinguisticService.notes.save({
      id: 'note-unit',
      targetType: 'unit',
      targetId: 'unit-note',
      content: { default: 'unit note' },
      createdAt: now,
      updatedAt: now,
    });
    await LinguisticService.notes.save({
      id: 'note-tok',
      targetType: 'token',
      targetId: 'tok-note',
      parentTargetId: 'unit-note',
      content: { default: 'token note' },
      createdAt: now,
      updatedAt: now,
    });
    await LinguisticService.notes.save({
      id: 'note-lex',
      targetType: 'lexeme',
      targetId: 'lex-other',
      content: { default: 'lexeme note' },
      createdAt: now,
      updatedAt: now,
    });

    const unitCalls = unitUpdated.mock.calls.filter((call) => call[0]?.unitId === 'unit-note');
    expect(unitCalls).toHaveLength(2);
    expect(unitUpdated.mock.calls.some((call) => call[0]?.unitId === 'lex-other')).toBe(false);
  });
});
