import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LEIPZIG_STRUCTURAL_PROFILE } from '../annotation/structuralRuleProfile';
import { db } from '../db';
import { LinguisticStructuralProfileService } from './LinguisticService.structuralProfiles';

describe('LinguisticStructuralProfileService', () => {
  const CRUD_LANGUAGE_ID = 'test-zho-structural-crud';
  const PREVIEW_LANGUAGE_ID = 'test-zho-structural-preview';
  const LIST_LANGUAGE_ID = 'test-zho-structural-list';

  beforeEach(async () => {
    await db.structural_rule_profiles.clear();
  });

  it('creates, lists, updates, and disables structural profile assets', async () => {
    const created = await LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
      scope: 'language',
      languageId: CRUD_LANGUAGE_ID,
      priority: 5,
      profile: {
        ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
        id: 'language.zho.structural.v1',
        scope: 'language',
      },
    });

    expect(created.languageId).toBe(CRUD_LANGUAGE_ID);
    expect(created.enabled).toBe(true);
    expect(await LinguisticStructuralProfileService.listStructuralRuleProfileAssets({ languageId: CRUD_LANGUAGE_ID })).toHaveLength(1);

    const updated = await LinguisticStructuralProfileService.updateStructuralRuleProfileAsset({
      id: created.id,
      priority: 10,
      profile: {
        ...created.profile,
        symbols: {
          ...created.profile.symbols,
          morphemeBoundary: '_',
        },
      },
    });
    expect(updated.priority).toBe(10);
    expect(updated.profile.symbols.morphemeBoundary).toBe('_');

    await LinguisticStructuralProfileService.setStructuralRuleProfileAssetEnabled(created.id, false);
    expect(await LinguisticStructuralProfileService.listStructuralRuleProfileAssets({ languageId: CRUD_LANGUAGE_ID })).toHaveLength(0);
    expect(await LinguisticStructuralProfileService.listStructuralRuleProfileAssets({ languageId: CRUD_LANGUAGE_ID, includeDisabled: true })).toHaveLength(1);
  });

  it('previews with matching language profile and returns candidate graph only', async () => {
    await LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
      scope: 'language',
      languageId: PREVIEW_LANGUAGE_ID,
      profile: {
        ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
        id: 'language.zho.structural.v1',
        scope: 'language',
        symbols: {
          ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.symbols,
          morphemeBoundary: '_',
        },
      },
    });

    const preview = await LinguisticStructuralProfileService.previewStructuralRuleProfile({
      languageId: PREVIEW_LANGUAGE_ID,
      glossText: 'dog_PL',
    });

    expect(preview.resolution.appliedAssetIds).toHaveLength(1);
    expect(preview.parseResult.boundaries.map((boundary) => boundary.marker)).toEqual(['_']);
    expect(preview.candidateGraph.relations.map((relation) => relation.type)).toContain('glosses');
    expect(await db.unit_relations.count()).toBe(0);
  });

  it('does not return unrelated scoped assets when listing by language', async () => {
    await LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
      scope: 'language',
      languageId: LIST_LANGUAGE_ID,
      profile: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, id: 'language.zho', scope: 'language' },
    });
    await LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
      scope: 'project',
      projectId: 'project-1',
      profile: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, id: 'project.one', scope: 'project' },
    });

    const rows = await LinguisticStructuralProfileService.listStructuralRuleProfileAssets({ languageId: LIST_LANGUAGE_ID });

    expect(rows.map((row) => row.scope)).toEqual(['language']);
  });

  it('rejects empty preview gloss text with a readable error', async () => {
    await expect(LinguisticStructuralProfileService.previewStructuralRuleProfile({
      glossText: '   ',
    })).rejects.toThrow('glossText must be non-empty');
  });
});
