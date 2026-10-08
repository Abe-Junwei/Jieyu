import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LEIPZIG_STRUCTURAL_PROFILE } from '../annotation/structuralRuleProfile';
import {
  SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID,
  SYSTEM_STRUCTURAL_RULE_PROFILE_TEMPLATES,
} from '../annotation/systemStructuralRuleProfiles';
import { db } from '../db';
import { JieyuWriteValidationError } from '../db/writeValidationMiddleware';
import {
  LinguisticStructuralProfileService,
  SystemStructuralTemplateReadOnlyError,
} from './LinguisticService.structuralProfiles';
import { CatalogProjectRequiredError } from './projectCatalogScope';

const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';

function ownedRows(
  items: Awaited<
    ReturnType<typeof LinguisticStructuralProfileService.listStructuralRuleProfileAssets>
  >,
) {
  return items.filter((item) => item.scope !== 'system');
}

describe('LinguisticStructuralProfileService', () => {
  const CRUD_LANGUAGE_ID = 'test-zho-structural-crud';
  const PREVIEW_LANGUAGE_ID = 'test-zho-structural-preview';
  const LIST_LANGUAGE_ID = 'test-zho-structural-list';

  beforeEach(async () => {
    await db.structural_rule_profiles.clear();
  });

  it('creates, lists, updates, and disables project-owned structural profile assets', async () => {
    const created = await LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
      scope: 'language',
      projectId: PROJECT_A,
      languageId: CRUD_LANGUAGE_ID,
      priority: 5,
      profile: {
        ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
        id: 'language.zho.structural.v1',
        scope: 'language',
      },
    });

    expect(created.languageId).toBe(CRUD_LANGUAGE_ID);
    expect(created.projectId).toBe(PROJECT_A);
    expect(created.enabled).toBe(true);
    const selector = { projectId: PROJECT_A, languageId: CRUD_LANGUAGE_ID };
    expect(
      ownedRows(await LinguisticStructuralProfileService.listStructuralRuleProfileAssets(selector)),
    ).toHaveLength(1);

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
    expect(updated.projectId).toBe(PROJECT_A);
    expect(updated.profile.symbols.morphemeBoundary).toBe('_');

    await LinguisticStructuralProfileService.setStructuralRuleProfileAssetEnabled(
      created.id,
      false,
    );
    expect(
      ownedRows(await LinguisticStructuralProfileService.listStructuralRuleProfileAssets(selector)),
    ).toHaveLength(0);
    expect(
      ownedRows(
        await LinguisticStructuralProfileService.listStructuralRuleProfileAssets({
          ...selector,
          includeDisabled: true,
        }),
      ),
    ).toHaveLength(1);
  });

  it('requires a project when creating a row', async () => {
    await expect(
      LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
        scope: 'project',
        projectId: '',
        profile: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, id: 'project.one', scope: 'project' },
      }),
    ).rejects.toBeInstanceOf(CatalogProjectRequiredError);
    expect(await db.structural_rule_profiles.count()).toBe(0);
  });

  it('previews with matching language profile and returns candidate graph only', async () => {
    const created = await LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
      scope: 'language',
      projectId: PROJECT_A,
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
      projectId: PROJECT_A,
      languageId: PREVIEW_LANGUAGE_ID,
      glossText: 'dog_PL',
    });

    expect(preview.resolution.appliedAssetIds).toContain(created.id);
    expect(preview.parseResult.boundaries.map((boundary) => boundary.marker)).toEqual(['_']);
    expect(preview.candidateGraph.relations.map((relation) => relation.type)).toContain('glosses');
    expect(await db.unit_relations.count()).toBe(0);
  });

  it('does not return other languages or other projects when listing', async () => {
    await LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
      scope: 'language',
      projectId: PROJECT_A,
      languageId: LIST_LANGUAGE_ID,
      profile: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, id: 'language.zho', scope: 'language' },
    });
    await LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
      scope: 'language',
      projectId: PROJECT_A,
      languageId: 'other-language',
      profile: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, id: 'language.other', scope: 'language' },
    });
    await LinguisticStructuralProfileService.createStructuralRuleProfileAsset({
      scope: 'project',
      projectId: PROJECT_B,
      profile: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, id: 'project.b', scope: 'project' },
    });

    const rows = ownedRows(
      await LinguisticStructuralProfileService.listStructuralRuleProfileAssets({
        projectId: PROJECT_A,
        languageId: LIST_LANGUAGE_ID,
      }),
    );

    expect(rows.map((row) => row.scope)).toEqual(['language']);
    expect(rows.every((row) => 'projectId' in row && row.projectId === PROJECT_A)).toBe(true);
  });

  it('rejects empty preview gloss text with a readable error', async () => {
    await expect(
      LinguisticStructuralProfileService.previewStructuralRuleProfile({
        glossText: '   ',
      }),
    ).rejects.toThrow('glossText must be non-empty');
  });
});

describe('T51 code-only system structural templates', () => {
  beforeEach(async () => {
    await db.structural_rule_profiles.clear();
  });

  it('keeps system templates out of the database while every project still sees Leipzig', async () => {
    const listA = await LinguisticStructuralProfileService.listStructuralRuleProfileAssets({
      projectId: PROJECT_A,
    });
    const listB = await LinguisticStructuralProfileService.listStructuralRuleProfileAssets({
      projectId: PROJECT_B,
    });
    const noProject = await LinguisticStructuralProfileService.listStructuralRuleProfileAssets();

    expect(await db.structural_rule_profiles.count()).toBe(0);
    for (const list of [listA, listB, noProject]) {
      expect(list.map((item) => item.id)).toContain(SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID);
    }
    expect(
      await LinguisticStructuralProfileService.getStructuralRuleProfileAsset(
        SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID,
      ),
    ).toMatchObject({ scope: 'system', isSystem: true });
    expect(Object.isFrozen(SYSTEM_STRUCTURAL_RULE_PROFILE_TEMPLATES[0])).toBe(true);
  });

  it('copies a template into project A without touching project B or the template', async () => {
    const templateBefore = JSON.stringify(SYSTEM_STRUCTURAL_RULE_PROFILE_TEMPLATES);
    const copy = await LinguisticStructuralProfileService.copySystemTemplateToProject({
      systemId: SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID,
      projectId: PROJECT_A,
    });
    expect(copy.id).not.toBe(SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID);
    expect(copy.id.startsWith('system.')).toBe(false);
    expect(copy.derivedFromSystemId).toBe(SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID);

    await LinguisticStructuralProfileService.updateStructuralRuleProfileAsset({
      id: copy.id,
      profile: {
        ...copy.profile,
        symbols: { ...copy.profile.symbols, morphemeBoundary: '_' },
      },
    });

    const listB = await LinguisticStructuralProfileService.listStructuralRuleProfileAssets({
      projectId: PROJECT_B,
    });
    expect(ownedRows(listB)).toEqual([]);
    expect(JSON.stringify(SYSTEM_STRUCTURAL_RULE_PROFILE_TEMPLATES)).toBe(templateBefore);
    const previewB = await LinguisticStructuralProfileService.previewStructuralRuleProfile({
      projectId: PROJECT_B,
      glossText: 'dog-PL',
    });
    expect(previewB.parseResult.boundaries.map((boundary) => boundary.marker)).toEqual(['-']);

    // 删除项目 A 的行不影响系统模板 | Deleting project A rows leaves the template intact
    await db.structural_rule_profiles.where('projectId').equals(PROJECT_A).delete();
    expect(
      await LinguisticStructuralProfileService.getStructuralRuleProfileAsset(
        SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID,
        PROJECT_A,
      ),
    ).toBeDefined();
    expect(JSON.stringify(SYSTEM_STRUCTURAL_RULE_PROFILE_TEMPLATES)).toBe(templateBefore);
  });

  it('refuses to edit a system template and refuses system.* ids in the database', async () => {
    await expect(
      LinguisticStructuralProfileService.updateStructuralRuleProfileAsset({
        id: SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID,
        priority: 9,
      }),
    ).rejects.toBeInstanceOf(SystemStructuralTemplateReadOnlyError);

    const now = new Date().toISOString();
    await expect(
      db.structural_rule_profiles.put({
        id: SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID,
        scope: 'project',
        projectId: PROJECT_A,
        enabled: true,
        priority: 0,
        profile: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, id: 'project.x', scope: 'project' },
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toBeInstanceOf(JieyuWriteValidationError);
    expect(await db.structural_rule_profiles.count()).toBe(0);
  });
});
