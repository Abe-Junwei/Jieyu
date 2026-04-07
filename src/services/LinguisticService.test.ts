import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLanguageLocalDisplayNameFromCatalog } from '../data/languageNameCatalog';
import { clearLanguageCatalogRuntimeCache } from '../data/languageCatalogRuntimeCache';
import { db } from '../db';
import type { AuditLogDocType, TierDefinitionDocType, TierAnnotationDocType } from '../db';
import { LinguisticService, validateTierConstraints } from './LinguisticService';
import { resolveLanguageQuery } from '../utils/langMapping';

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.texts.clear(),
    db.media_items.clear(),
    db.utterances.clear(),
    db.utterance_tokens.clear(),
    db.utterance_morphemes.clear(),
    db.anchors.clear(),
    db.lexemes.clear(),
    db.token_lexeme_links.clear(),
    db.ai_tasks.clear(),
    db.embeddings.clear(),
    db.languages.clear(),
    db.language_display_names.clear(),
    db.language_aliases.clear(),
    db.language_catalog_history.clear(),
    db.custom_field_definitions.clear(),
    db.speakers.clear(),
    db.orthographies.clear(),
    db.orthography_bridges.clear(),
    db.locations.clear(),
    db.bibliographic_sources.clear(),
    db.grammar_docs.clear(),
    db.abbreviations.clear(),
    db.phonemes.clear(),
    db.tag_definitions.clear(),
    db.layer_links.clear(),
    db.tier_definitions.clear(),
    db.tier_annotations.clear(),
    db.audit_logs.clear(),
    db.user_notes.clear(),
    db.layer_units.clear(),
    db.layer_unit_contents.clear(),
    db.unit_relations.clear(),
  ]);
}

describe('LinguisticService smoke tests', () => {
  beforeEach(async () => {
    await db.open();
    await clearDatabase();
    clearLanguageCatalogRuntimeCache();
  });

  it('can create an orthography for the target language', async () => {
    const created = await LinguisticService.createOrthography({
      languageId: 'cmn',
      name: { zho: '普通话 IPA', eng: 'Mandarin IPA' },
      abbreviation: 'IPA',
      scriptTag: 'Latn',
      type: 'phonetic',
      direction: 'ltr',
      fontPreferences: {
        primary: ['Charis SIL'],
        fallback: ['Noto Sans'],
        lineHeightScale: 1.1,
      },
      bidiPolicy: {
        isolateInlineRuns: false,
        preferDirAttribute: true,
      },
    });

    const saved = await db.orthographies.get(created.id);
    expect(saved?.languageId).toBe('cmn');
    expect(saved?.name.zho).toBe('普通话 IPA');
    expect(saved?.abbreviation).toBe('IPA');
    expect(saved?.type).toBe('phonetic');
    expect(saved?.direction).toBe('ltr');
    expect(saved?.fontPreferences?.primary).toEqual(['Charis SIL']);
    expect(saved?.bidiPolicy?.preferDirAttribute).toBe(true);
    expect(saved?.updatedAt).toBeTruthy();
  });

  it('rejects invalid ISO 639-3 language ids for project and orthography creation', async () => {
    await expect(LinguisticService.createProject({
      primaryTitle: '项目',
      englishFallbackTitle: 'Project',
      primaryLanguageId: 'zh',
    })).rejects.toThrow('primaryLanguageId 必须是有效的 ISO 639-3 三字母代码');

    await expect(LinguisticService.createOrthography({
      languageId: 'zh',
      name: { eng: 'Invalid Orthography' },
    })).rejects.toThrow('languageId 必须是已存在的语言资产 ID 或有效的 ISO 639-3 三字母代码');
  });

  it('allows existing custom language assets to own orthographies', async () => {
    const customLanguage = await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:hak-community',
      localName: '客话社区语',
      englishName: 'Hakka Community Language',
      nativeName: 'Hak-ka-fa',
    });

    const created = await LinguisticService.createOrthography({
      languageId: customLanguage.id,
      name: { zho: '客话社区语拼写', eng: 'Hakka Community Orthography' },
      scriptTag: 'Latn',
      type: 'practical',
      direction: 'ltr',
    });

    expect(created.languageId).toBe('user:hak-community');

    const cloned = await LinguisticService.cloneOrthographyToLanguage({
      sourceOrthographyId: created.id,
      targetLanguageId: 'user:hak-community',
      name: { zho: '客话社区语拼写-副本', eng: 'Hakka Community Orthography Copy' },
      type: 'phonemic',
    });

    expect(cloned.languageId).toBe('user:hak-community');
  });

  it('stores new project titles in neutral primary and English fallback slots', async () => {
    const created = await LinguisticService.createProject({
      primaryTitle: '白马藏语田野调查',
      englishFallbackTitle: 'Baima Tibetan Fieldwork',
      primaryLanguageId: 'eng',
    });

    const saved = await db.texts.get(created.textId);
    expect(saved?.title.und).toBe('白马藏语田野调查');
    expect(saved?.title.eng).toBe('Baima Tibetan Fieldwork');
  });

  it('can update an existing orthography while preserving catalog metadata', async () => {
    await db.orthographies.put({
      id: 'orth_update_1',
      name: { eng: 'English Practical' },
      languageId: 'eng',
      scriptTag: 'Latn',
      type: 'practical',
      direction: 'ltr',
      catalogMetadata: {
        catalogSource: 'built-in-reviewed',
        reviewStatus: 'verified-primary',
        priority: 'primary',
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const updated = await LinguisticService.updateOrthography({
      id: 'orth_update_1',
      languageId: 'eng',
      name: { eng: 'English Practical Updated' },
      abbreviation: 'ENG-P',
      scriptTag: 'Latn',
      type: 'phonemic',
      direction: 'ltr',
      localeTag: 'en-Latn-US',
      exemplarCharacters: { main: ['a', 'b'] },
      fontPreferences: {
        primary: ['Andika'],
        fallback: ['Noto Sans'],
      },
      bidiPolicy: {
        isolateInlineRuns: false,
        preferDirAttribute: true,
      },
    });

    const saved = await db.orthographies.get('orth_update_1');
    expect(updated.name.eng).toBe('English Practical Updated');
    expect(saved?.abbreviation).toBe('ENG-P');
    expect(saved?.type).toBe('phonemic');
    expect(saved?.localeTag).toBe('en-Latn-US');
    expect(saved?.exemplarCharacters?.main).toEqual(['a', 'b']);
    expect(saved?.fontPreferences?.primary).toEqual(['Andika']);
    expect(saved?.catalogMetadata).toEqual({
      catalogSource: 'built-in-reviewed',
      reviewStatus: 'verified-primary',
      priority: 'primary',
    });
    expect(saved?.createdAt).toBe(NOW);
    expect(saved?.updatedAt).not.toBe(NOW);
  });

  it('can update orthography catalog review metadata from the workspace', async () => {
    await db.orthographies.put({
      id: 'orth_update_catalog_1',
      name: { eng: 'Generated Orthography' },
      languageId: 'eng',
      scriptTag: 'Latn',
      type: 'practical',
      direction: 'ltr',
      catalogMetadata: {
        catalogSource: 'built-in-generated',
        source: 'cldr-default',
        reviewStatus: 'needs-review',
        priority: 'primary',
        seedKind: 'script-derived',
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.updateOrthography({
      id: 'orth_update_catalog_1',
      languageId: 'eng',
      name: { eng: 'Generated Orthography' },
      scriptTag: 'Latn',
      type: 'practical',
      direction: 'ltr',
      catalogMetadata: {
        reviewStatus: 'verified-secondary',
        priority: 'secondary',
      },
    });

    const saved = await db.orthographies.get('orth_update_catalog_1');
    expect(saved?.catalogMetadata).toEqual({
      catalogSource: 'built-in-generated',
      source: 'cldr-default',
      reviewStatus: 'verified-secondary',
      priority: 'secondary',
      seedKind: 'script-derived',
    });
  });

  it('can materialize and update a built-in orthography from the workspace', async () => {
    const updated = await LinguisticService.updateOrthography({
      id: 'eng-latn',
      languageId: 'eng',
      name: { eng: 'English Workspace Override' },
      scriptTag: 'Latn',
      type: 'practical',
      direction: 'ltr',
      inputHints: {
        keyboardLayout: 'us-intl',
      },
      catalogMetadata: {
        reviewStatus: 'verified-secondary',
        priority: 'secondary',
      },
    });

    const saved = await db.orthographies.get('eng-latn');
    expect(updated.name.eng).toBe('English Workspace Override');
    expect(saved?.inputHints?.keyboardLayout).toBe('us-intl');
    expect(saved?.catalogMetadata).toEqual(expect.objectContaining({
      catalogSource: 'built-in-reviewed',
      reviewStatus: 'verified-secondary',
      priority: 'secondary',
    }));
  });

  it('canonicalizes orthography identity tags and rejects duplicate identities', async () => {
    const created = await LinguisticService.createOrthography({
      languageId: 'ENG',
      name: { eng: 'English Canonicalized' },
      localeTag: 'EN_latn_us_fonipa',
    });

    const saved = await db.orthographies.get(created.id);
    expect(saved?.languageId).toBe('eng');
    expect(saved?.localeTag).toBe('en-Latn-US-fonipa');
    expect(saved?.scriptTag).toBe('Latn');
    expect(saved?.regionTag).toBe('US');
    expect(saved?.variantTag).toBe('fonipa');

    await expect(LinguisticService.createOrthography({
      languageId: 'eng',
      name: { eng: 'English Canonicalized Duplicate' },
      type: 'practical',
      scriptTag: 'latn',
      regionTag: 'us',
      variantTag: 'FONIPA',
    })).rejects.toThrow('已存在相同语言/类型/脚本/地区/变体身份的正字法');
  });

  it('can clone an orthography into another language as a new record', async () => {
    await db.orthographies.put({
      id: 'orth_source_1',
      name: { eng: 'English Practical' },
      languageId: 'eng',
      abbreviation: 'ENG-PRAC',
      scriptTag: 'Latn',
      type: 'practical',
      direction: 'ltr',
      fontPreferences: {
        primary: ['Andika'],
        fallback: ['Noto Sans'],
      },
      bidiPolicy: {
        isolateInlineRuns: false,
        preferDirAttribute: true,
      },
      conversionRules: { romanized: true },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const cloned = await LinguisticService.cloneOrthographyToLanguage({
      sourceOrthographyId: 'orth_source_1',
      targetLanguageId: 'cmn',
      name: { zho: '普通话拉丁化', eng: 'Mandarin Latinized' },
      abbreviation: 'CMN-LATN',
    });

    const saved = await db.orthographies.get(cloned.id);
    expect(cloned.id).not.toBe('orth_source_1');
    expect(saved?.languageId).toBe('cmn');
    expect(saved?.name.zho).toBe('普通话拉丁化');
    expect(saved?.abbreviation).toBe('CMN-LATN');
    expect(saved?.scriptTag).toBe('Latn');
    expect(saved?.direction).toBe('ltr');
    expect(saved?.fontPreferences?.primary).toEqual(['Andika']);
    expect(saved?.bidiPolicy?.preferDirAttribute).toBe(true);
    expect(saved?.conversionRules).toEqual({ romanized: true });
  });

  it('can clone a built-in orthography source into another language', async () => {
    const cloned = await LinguisticService.cloneOrthographyToLanguage({
      sourceOrthographyId: 'eng-latn',
      targetLanguageId: 'cmn',
      name: { zho: '普通话英语派生', eng: 'Mandarin from English Built-in' },
      abbreviation: 'CMN-ENG-DERIVED',
    });

    const saved = await db.orthographies.get(cloned.id);
    expect(cloned.id).not.toBe('eng-latn');
    expect(saved?.languageId).toBe('cmn');
    expect(saved?.scriptTag).toBe('Latn');
    expect(saved?.abbreviation).toBe('CMN-ENG-DERIVED');
    expect(saved?.catalogMetadata?.catalogSource).toBe('user');
  });

  it('can create and query orthography transforms', async () => {
    await db.orthographies.bulkPut([
      {
        id: 'orth_source_transform',
        name: { eng: 'Source Orthography' },
        languageId: 'eng',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_target_transform',
        name: { eng: 'Target Orthography' },
        languageId: 'eng',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const created = await LinguisticService.createOrthographyBridge({
      sourceOrthographyId: 'orth_source_transform',
      targetOrthographyId: 'orth_target_transform',
      engine: 'table-map',
      rules: {
        mappings: [
          { from: 'aa', to: 'a' },
          { from: 'sh', to: 's' },
        ],
      },
      sampleInput: 'shaam',
      sampleOutput: 'sam',
      sampleCases: [
        { input: 'shaam', expectedOutput: 'sam' },
        { input: 'sh', expectedOutput: 's' },
      ],
      isReversible: true,
      status: 'active',
    });

    const listed = await LinguisticService.listOrthographyBridges({
      sourceOrthographyId: 'orth_source_transform',
    });

    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
    expect(listed[0]?.sampleOutput).toBe('sam');
    expect(listed[0]?.sampleCases).toEqual([
      { input: 'shaam', expectedOutput: 'sam' },
      { input: 'sh', expectedOutput: 's' },
    ]);
    expect(listed[0]?.isReversible).toBe(true);
    expect(LinguisticService.previewOrthographyBridge({
      engine: 'table-map',
      rules: { mappings: [{ from: 'sh', to: 's' }] },
      text: 'sha',
    })).toBe('sa');
  });

  it('demotes older active sibling transforms when a new active transform is created', async () => {
    await db.orthographies.bulkPut([
      {
        id: 'orth_create_source',
        name: { eng: 'Create Source' },
        languageId: 'eng',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_create_target',
        name: { eng: 'Create Target' },
        languageId: 'cmn',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await db.orthography_bridges.put({
      id: 'orthxfm_existing_active',
      sourceOrthographyId: 'orth_create_source',
      targetOrthographyId: 'orth_create_target',
      engine: 'table-map',
      rules: { mappings: [{ from: 'sh', to: 's' }] },
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const created = await LinguisticService.createOrthographyBridge({
      sourceOrthographyId: 'orth_create_source',
      targetOrthographyId: 'orth_create_target',
      engine: 'table-map',
      rules: { mappings: [{ from: 'aa', to: 'a' }] },
      status: 'active',
    });

    expect(created.status).toBe('active');
    expect((await db.orthography_bridges.get('orthxfm_existing_active'))?.status).toBe('draft');
  });

  it('accepts built-in orthographies when creating bridge transforms', async () => {
    await db.orthographies.put({
      id: 'orth_runtime_target_user',
      name: { eng: 'Runtime Target User' },
      languageId: 'cmn',
      scriptTag: 'Latn',
      type: 'practical',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const created = await LinguisticService.createOrthographyBridge({
      sourceOrthographyId: 'eng-latn',
      targetOrthographyId: 'orth_runtime_target_user',
      engine: 'table-map',
      rules: { mappings: [{ from: 'sh', to: 's' }] },
      status: 'active',
    });

    expect(created.sourceOrthographyId).toBe('eng-latn');
    expect((await db.orthography_bridges.get(created.id))?.targetOrthographyId).toBe('orth_runtime_target_user');
  });

  it('prefers active orthography transforms for runtime application', async () => {
    await db.orthographies.bulkPut([
      {
        id: 'orth_runtime_source',
        name: { eng: 'Runtime Source' },
        languageId: 'eng',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_runtime_target',
        name: { eng: 'Runtime Target' },
        languageId: 'eng',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.orthography_bridges.bulkPut([
      {
        id: 'orthxfm_runtime_draft',
        sourceOrthographyId: 'orth_runtime_source',
        targetOrthographyId: 'orth_runtime_target',
        engine: 'table-map',
        rules: {
          mappings: [{ from: 'sh', to: 'x' }],
        },
        status: 'draft',
        createdAt: '2026-03-31T00:00:00.000Z',
        updatedAt: '2026-03-31T00:00:00.000Z',
      },
      {
        id: 'orthxfm_runtime_active',
        sourceOrthographyId: 'orth_runtime_source',
        targetOrthographyId: 'orth_runtime_target',
        engine: 'table-map',
        rules: {
          mappings: [{ from: 'sh', to: 's' }],
        },
        status: 'active',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
      {
        id: 'orthxfm_runtime_deprecated',
        sourceOrthographyId: 'orth_runtime_source',
        targetOrthographyId: 'orth_runtime_target',
        engine: 'table-map',
        rules: {
          mappings: [{ from: 'sh', to: 'z' }],
        },
        status: 'deprecated',
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z',
      },
    ]);

    const selected = await LinguisticService.getActiveOrthographyBridge({
      sourceOrthographyId: 'orth_runtime_source',
      targetOrthographyId: 'orth_runtime_target',
    });
    const applied = await LinguisticService.applyOrthographyBridge({
      sourceOrthographyId: 'orth_runtime_source',
      targetOrthographyId: 'orth_runtime_target',
      text: 'shaam',
    });

    expect(selected?.id).toBe('orthxfm_runtime_active');
    expect(applied).toEqual({
      text: 'saam',
      bridgeId: 'orthxfm_runtime_active',
    });
  });

  it('does not apply draft-only orthography transforms at runtime', async () => {
    await db.orthographies.bulkPut([
      {
        id: 'orth_runtime_draft_source',
        name: { eng: 'Runtime Draft Source' },
        languageId: 'eng',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_runtime_draft_target',
        name: { eng: 'Runtime Draft Target' },
        languageId: 'eng',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.orthography_bridges.put({
      id: 'orthxfm_runtime_only_draft',
      sourceOrthographyId: 'orth_runtime_draft_source',
      targetOrthographyId: 'orth_runtime_draft_target',
      engine: 'table-map',
      rules: {
        mappings: [{ from: 'sh', to: 's' }],
      },
      status: 'draft',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const selected = await LinguisticService.getActiveOrthographyBridge({
      sourceOrthographyId: 'orth_runtime_draft_source',
      targetOrthographyId: 'orth_runtime_draft_target',
    });
    const applied = await LinguisticService.applyOrthographyBridge({
      sourceOrthographyId: 'orth_runtime_draft_source',
      targetOrthographyId: 'orth_runtime_draft_target',
      text: 'shaam',
    });

    expect(selected).toBeNull();
    expect(applied).toEqual({ text: 'shaam' });
  });

  it('applies active icu-rule transforms through runtime service path', async () => {
    await db.orthographies.bulkPut([
      {
        id: 'orth_runtime_icu_source',
        name: { eng: 'Runtime ICU Source' },
        languageId: 'eng',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_runtime_icu_target',
        name: { eng: 'Runtime ICU Target' },
        languageId: 'eng',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.orthography_bridges.bulkPut([
      {
        id: 'orthxfm_runtime_icu_active',
        sourceOrthographyId: 'orth_runtime_icu_source',
        targetOrthographyId: 'orth_runtime_icu_target',
        engine: 'icu-rule',
        rules: {
          ruleText: '/(.)h/ => $1\naa => a',
        },
        status: 'active',
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    ]);

    const applied = await LinguisticService.applyOrthographyBridge({
      sourceOrthographyId: 'orth_runtime_icu_source',
      targetOrthographyId: 'orth_runtime_icu_target',
      text: 'shaakh',
    });

    expect(applied).toEqual({
      text: 'sak',
      bridgeId: 'orthxfm_runtime_icu_active',
    });
  });

  it('can update, reorder, and delete orthography transforms', async () => {
    await db.orthographies.bulkPut([
      {
        id: 'orth_manage_source',
        name: { eng: 'Manage Source' },
        languageId: 'eng',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_manage_target',
        name: { eng: 'Manage Target' },
        languageId: 'cmn',
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await db.orthography_bridges.bulkPut([
      {
        id: 'orthxfm_manage_draft',
        sourceOrthographyId: 'orth_manage_source',
        targetOrthographyId: 'orth_manage_target',
        engine: 'table-map',
        rules: { mappings: [{ from: 'aa', to: 'a' }] },
        status: 'draft',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
      {
        id: 'orthxfm_manage_old_active',
        sourceOrthographyId: 'orth_manage_source',
        targetOrthographyId: 'orth_manage_target',
        engine: 'table-map',
        rules: { mappings: [{ from: 'sh', to: 's' }] },
        status: 'active',
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z',
      },
    ]);

    const updated = await LinguisticService.updateOrthographyBridge({
      id: 'orthxfm_manage_draft',
      name: { zho: '导入映射' },
      status: 'active',
      sampleInput: 'shaam',
      sampleOutput: 'sam',
      sampleCases: [{ input: 'sh', expectedOutput: 's' }],
      isReversible: true,
      rules: { mappings: [{ from: 'sh', to: 's' }, { from: 'aa', to: 'a' }] },
    });

    expect(updated.status).toBe('active');
    expect(updated.name?.zho).toBe('导入映射');
    expect(updated.sampleOutput).toBe('sam');
    expect(updated.isReversible).toBe(true);

    const listed = await LinguisticService.listOrthographyBridges({
      targetOrthographyId: 'orth_manage_target',
    });
    expect(listed.map((item) => item.id)).toEqual([
      'orthxfm_manage_draft',
      'orthxfm_manage_old_active',
    ]);
    expect((await db.orthography_bridges.get('orthxfm_manage_old_active'))?.status).toBe('draft');

    await LinguisticService.deleteOrthographyBridge('orthxfm_manage_old_active');
    expect(await db.orthography_bridges.get('orthxfm_manage_old_active')).toBeUndefined();
  });

  it('can save utterance and query by media time', async () => {
    const now = new Date().toISOString();

    await LinguisticService.saveUtterance({
      id: 'utt_1',
      textId: 'text_1',
      startTime: 2.5,
      endTime: 6.5,
      createdAt: now,
      updatedAt: now,
    });

    const hit = await LinguisticService.getUtteranceAtTime(3.2);
    const miss = await LinguisticService.getUtteranceAtTime(9.9);

    expect(hit?.id).toBe('utt_1');
    expect(miss).toBeUndefined();
  });

  it('syncs default transcription utterance into layer_units', async () => {
    await LinguisticService.saveTranslationLayer({
      id: 'layer_default_sync',
      textId: 'text_sync',
      key: 'trc_default',
      name: { zho: '默认转写层' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveUtterance({
      id: 'utt_sync_1',
      textId: 'text_sync',
      mediaId: 'media_sync',
      startTime: 0,
      endTime: 1,
      speakerId: 'speaker_sync',
      annotationStatus: 'raw',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const unit = await db.layer_units.get('utt_sync_1');
    expect(unit).toBeTruthy();
    expect(unit?.layerId).toBe('layer_default_sync');
    expect(unit?.unitType).toBe('utterance');
    expect(unit?.speakerId).toBe('speaker_sync');
  });

  it('enforces time_subdivision child bounds when parent utterance is resized', async () => {
    const now = new Date().toISOString();

    await LinguisticService.saveUtterance({
      id: 'utt_parent_resize_1',
      textId: 'text_1',
      mediaId: 'media_1',
      startTime: 1.0,
      endTime: 3.0,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    });

    await db.layer_units.put({
      id: 'seg_child_resize_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_sub',
      unitType: 'segment',
      startTime: 1.2,
      endTime: 2.8,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_relations.put({
      id: 'lnk_child_resize_1',
      textId: 'text_1',
      sourceUnitId: 'seg_child_resize_1',
      targetUnitId: 'utt_parent_resize_1',
      relationType: 'derived_from',
      createdAt: now,
      updatedAt: now,
    });

    await LinguisticService.saveUtterance({
      id: 'utt_parent_resize_1',
      textId: 'text_1',
      mediaId: 'media_1',
      startTime: 1.4,
      endTime: 2.0,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    });

    const child = await db.layer_units.get('seg_child_resize_1');
    expect(child?.startTime).toBe(1.4);
    expect(child?.endTime).toBe(2.0);
  });

  it('can persist translation layer and utterance text linkage', async () => {
    const now = new Date().toISOString();

    await LinguisticService.saveTranslationLayer({
      id: 'layer_1',
      textId: 'text_1',
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
      startTime: 0,
      endTime: 1,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    });

    await LinguisticService.saveUtteranceText({
      id: 'utr_1',
      utteranceId: 'utt_2',
      layerId: 'layer_1',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    });

    const layers = await LinguisticService.getTranslationLayers('translation');
    const records = await LinguisticService.getUtteranceTexts('utt_2');

    expect(layers).toHaveLength(1);
    expect(layers[0]!.id).toBe('layer_1');
    expect(records).toHaveLength(1);
    expect(records[0]!.text).toBe('hello');
  });

  it('can persist utterance text through canonical LayerUnit write path', async () => {
    const now = new Date().toISOString();

    await LinguisticService.saveTranslationLayer({
      id: 'layer_stop_write',
      textId: 'text_stop_write',
      key: 'eng_stop_write',
      name: { eng: 'English Stop Write' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      createdAt: now,
      updatedAt: now,
    });

    await LinguisticService.saveUtterance({
      id: 'utt_stop_write',
      textId: 'text_stop_write',
      startTime: 0,
      endTime: 1,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    });

    await LinguisticService.saveUtteranceText({
      id: 'utr_stop_write',
      utteranceId: 'utt_stop_write',
      layerId: 'layer_stop_write',
      modality: 'text',
      text: 'layerunit only text',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    });

    const records = await LinguisticService.getUtteranceTexts('utt_stop_write');

    expect(await db.layer_units.get('segv2_layer_stop_write_utt_stop_write')).toBeTruthy();
    expect(await db.layer_unit_contents.get('utr_stop_write')).toEqual(expect.objectContaining({
      unitId: 'segv2_layer_stop_write_utt_stop_write',
      text: 'layerunit only text',
    }));
    expect(records).toHaveLength(1);
    expect(records[0]!.text).toBe('layerunit only text');
  });

  it('can read canonical tokens/morphemes via service APIs', async () => {
    const now = new Date().toISOString();

    await LinguisticService.saveUtterance({
      id: 'utt_read_1',
      textId: 'text_read',
      startTime: 0,
      endTime: 2,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    });

    await LinguisticService.saveTokensBatch([
      {
        id: 'tok_2',
        textId: 'text_read',
        utteranceId: 'utt_read_1',
        tokenIndex: 1,
        form: { default: 'word2' },
        gloss: { eng: 'second' },
        pos: 'VERB',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok_1',
        textId: 'text_read',
        utteranceId: 'utt_read_1',
        tokenIndex: 0,
        form: { default: 'word1' },
        gloss: { eng: 'first' },
        pos: 'NOUN',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await LinguisticService.saveMorphemesBatch([
      {
        id: 'mor_2',
        textId: 'text_read',
        utteranceId: 'utt_read_1',
        tokenId: 'tok_2',
        morphemeIndex: 1,
        form: { default: 'mor2' },
        gloss: { eng: 'suffix' },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mor_1',
        textId: 'text_read',
        utteranceId: 'utt_read_1',
        tokenId: 'tok_2',
        morphemeIndex: 0,
        form: { default: 'mor1' },
        gloss: { eng: 'root' },
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const tokens = await LinguisticService.getTokensByUtteranceId('utt_read_1');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.id).toBe('tok_1');
    expect(tokens[0]!.form.default).toBe('word1');
    expect(tokens[0]!.tokenIndex).toBe(0);
    expect(tokens[1]!.id).toBe('tok_2');
    expect(tokens[1]!.form.default).toBe('word2');
    expect(tokens[1]!.tokenIndex).toBe(1);

    const morph1 = await LinguisticService.getMorphemesByTokenId('tok_1');
    expect(morph1).toHaveLength(0);

    const morph2 = await LinguisticService.getMorphemesByTokenId('tok_2');
    expect(morph2).toHaveLength(2);
    expect(morph2[0]!.form.default).toBe('mor1');
    expect(morph2[0]!.morphemeIndex).toBe(0);
    expect(morph2[1]!.form.default).toBe('mor2');
    expect(morph2[1]!.morphemeIndex).toBe(1);
  });

    it('supports creating speaker and assigning speaker to utterances', async () => {
      const now = new Date().toISOString();

      await LinguisticService.saveUtterance({
        id: 'utt_spk_assign_1',
        textId: 'text_spk_assign',
        startTime: 0,
        endTime: 1,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      });

      const speaker = await LinguisticService.createSpeaker({ name: '说话人甲' });
      const updatedCount = await LinguisticService.assignSpeakerToUtterances(['utt_spk_assign_1'], speaker.id);
      const utterances = await LinguisticService.getAllUtterances();
      const speakers = await LinguisticService.getSpeakers();

      expect(updatedCount).toBe(1);
      expect(utterances).toHaveLength(1);
      expect(utterances[0]!.speakerId).toBe(speaker.id);
      expect(utterances[0]!.speaker).toBe('说话人甲');
      expect(speakers.map((s) => s.id)).toContain(speaker.id);
    });

    it('renames speaker and propagates the new name to linked utterances', async () => {
      const now = new Date().toISOString();

      await LinguisticService.saveUtterance({
        id: 'utt_spk_rename_1',
        textId: 'text_spk_rename',
        startTime: 0,
        endTime: 1,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      });

      const speaker = await LinguisticService.createSpeaker({ name: '旧名' });
      await LinguisticService.assignSpeakerToUtterances(['utt_spk_rename_1'], speaker.id);
      const renamed = await LinguisticService.renameSpeaker(speaker.id, '新名');
      const utterances = await LinguisticService.getAllUtterances();

      expect(renamed.name).toBe('新名');
      expect(utterances[0]!.speakerId).toBe(speaker.id);
      expect(utterances[0]!.speaker).toBe('新名');
    });

    it('merges speaker and migrates utterances to target speaker', async () => {
      const now = new Date().toISOString();

      await LinguisticService.saveUtterance({
        id: 'utt_spk_merge_1',
        textId: 'text_spk_merge',
        startTime: 0,
        endTime: 1,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      });
      await LinguisticService.saveUtterance({
        id: 'utt_spk_merge_2',
        textId: 'text_spk_merge',
        startTime: 2,
        endTime: 3,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      });

      const source = await LinguisticService.createSpeaker({ name: '来源说话人' });
      const target = await LinguisticService.createSpeaker({ name: '目标说话人' });
      await LinguisticService.assignSpeakerToUtterances(['utt_spk_merge_1', 'utt_spk_merge_2'], source.id);

      const moved = await LinguisticService.mergeSpeakers(source.id, target.id);
      const speakers = await LinguisticService.getSpeakers();
      const utterances = await LinguisticService.getAllUtterances();

      expect(moved).toBe(2);
      expect(speakers.map((s) => s.id)).not.toContain(source.id);
      expect(speakers.map((s) => s.id)).toContain(target.id);
      expect(utterances.every((u) => u.speakerId === target.id)).toBe(true);
      expect(utterances.every((u) => u.speaker === '目标说话人')).toBe(true);
    });

    it('merges speaker and migrates independent segments to target speaker', async () => {
      const now = new Date().toISOString();

      await db.layer_units.put({
        id: 'seg_spk_merge_1',
        textId: 'text_spk_merge_seg',
        mediaId: 'media_spk_merge_seg',
        layerId: 'layer_independent',
        unitType: 'segment',
        startTime: 0,
        endTime: 1,
        createdAt: now,
        updatedAt: now,
      });

      const source = await LinguisticService.createSpeaker({ name: '来源语段说话人' });
      const target = await LinguisticService.createSpeaker({ name: '目标语段说话人' });
      await LinguisticService.assignSpeakerToSegments(['seg_spk_merge_1'], source.id);

      const moved = await LinguisticService.mergeSpeakers(source.id, target.id);
      const segment = await db.layer_units.get('seg_spk_merge_1');

      expect(moved).toBe(1);
      expect(segment?.speakerId).toBe(target.id);
    });

    it('clears speaker assignment when assigning undefined speaker id', async () => {
      const now = new Date().toISOString();

      await LinguisticService.saveUtterance({
        id: 'utt_spk_clear_1',
        textId: 'text_spk_clear',
        startTime: 0,
        endTime: 1,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      });

      const speaker = await LinguisticService.createSpeaker({ name: '待清空说话人' });
      await LinguisticService.assignSpeakerToUtterances(['utt_spk_clear_1'], speaker.id);
      const cleared = await LinguisticService.assignSpeakerToUtterances(['utt_spk_clear_1'], undefined);
      const utterances = await LinguisticService.getAllUtterances();

      expect(cleared).toBe(1);
      expect(utterances[0]!.speakerId).toBeUndefined();
      expect(utterances[0]!.speaker).toBeUndefined();
    });

    it('supports assigning speaker directly to independent segments', async () => {
      const now = new Date().toISOString();

      await db.layer_units.put({
        id: 'seg_spk_assign_1',
        textId: 'text_spk_assign',
        mediaId: 'media_spk_assign',
        layerId: 'layer_independent',
        unitType: 'segment',
        startTime: 0,
        endTime: 1,
        createdAt: now,
        updatedAt: now,
      });

      const speaker = await LinguisticService.createSpeaker({ name: '独立语段说话人' });
      const updatedCount = await LinguisticService.assignSpeakerToSegments(['seg_spk_assign_1'], speaker.id);
  const segment = await db.layer_units.get('seg_spk_assign_1');

      expect(updatedCount).toBe(1);
      expect(segment?.speakerId).toBe(speaker.id);
    });

    it('supports assigning speaker to LayerUnit-only segments', async () => {
      const now = new Date().toISOString();

      await db.layer_units.put({
        id: 'seg_spk_assign_unit_1',
        textId: 'text_spk_assign_unit',
        mediaId: 'media_spk_assign_unit',
        layerId: 'layer_independent',
        unitType: 'segment',
        startTime: 0,
        endTime: 1,
        createdAt: now,
        updatedAt: now,
      });

      const speaker = await LinguisticService.createSpeaker({ name: 'LayerUnit 语段说话人' });
      const updatedCount = await LinguisticService.assignSpeakerToSegments(['seg_spk_assign_unit_1'], speaker.id);
      const unit = await db.layer_units.get('seg_spk_assign_unit_1');

      expect(updatedCount).toBe(1);
      expect(unit?.speakerId).toBe(speaker.id);
    });

    it('clears segment speaker assignment when assigning undefined speaker id', async () => {
      const now = new Date().toISOString();
      const speaker = await LinguisticService.createSpeaker({ name: '待清空独立语段说话人' });

      await db.layer_units.put({
        id: 'seg_spk_clear_1',
        textId: 'text_spk_clear',
        mediaId: 'media_spk_clear',
        layerId: 'layer_independent',
        unitType: 'segment',
        speakerId: speaker.id,
        startTime: 0,
        endTime: 1,
        createdAt: now,
        updatedAt: now,
      });

      const cleared = await LinguisticService.assignSpeakerToSegments(['seg_spk_clear_1'], undefined);
      const segment = await db.layer_units.get('seg_spk_clear_1');

      expect(cleared).toBe(1);
      expect(segment?.speakerId).toBeUndefined();
    });

    it('deletes speaker with clear strategy and clears independent segment references', async () => {
      const now = new Date().toISOString();
      const speaker = await LinguisticService.createSpeaker({ name: '待删除独立语段说话人' });

      await db.layer_units.put({
        id: 'seg_spk_delete_1',
        textId: 'text_spk_delete',
        mediaId: 'media_spk_delete',
        layerId: 'layer_independent',
        unitType: 'segment',
        speakerId: speaker.id,
        startTime: 0,
        endTime: 1,
        createdAt: now,
        updatedAt: now,
      });

      const cleared = await LinguisticService.deleteSpeaker(speaker.id, { strategy: 'clear' });
      const segment = await db.layer_units.get('seg_spk_delete_1');

      expect(cleared).toBe(1);
      expect(segment?.speakerId).toBeUndefined();
    });

    it('rejects deleting speaker when independent segments still reference it', async () => {
      const now = new Date().toISOString();
      const speaker = await LinguisticService.createSpeaker({ name: '被引用语段说话人' });

      await db.layer_units.put({
        id: 'seg_spk_delete_reject_1',
        textId: 'text_spk_delete_reject',
        mediaId: 'media_spk_delete_reject',
        layerId: 'layer_independent',
        unitType: 'segment',
        speakerId: speaker.id,
        startTime: 0,
        endTime: 1,
        createdAt: now,
        updatedAt: now,
      });

      await expect(LinguisticService.deleteSpeaker(speaker.id)).rejects.toThrow('说话人仍被 1 条句段引用');
    });

    it('reports combined utterance and segment speaker reference stats', async () => {
      const now = new Date().toISOString();
      await LinguisticService.saveUtterance({
        id: 'utt_stats_1',
        textId: 'text_stats',
        mediaId: 'media_stats',
        startTime: 0,
        endTime: 1,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      });

      await db.layer_units.put({
        id: 'seg_stats_1',
        textId: 'text_stats',
        mediaId: 'media_stats',
        layerId: 'layer_independent',
        unitType: 'segment',
        startTime: 2,
        endTime: 3,
        createdAt: now,
        updatedAt: now,
      });

      const speaker = await LinguisticService.createSpeaker({ name: '统计说话人' });
      await LinguisticService.assignSpeakerToUtterances(['utt_stats_1'], speaker.id);
      await LinguisticService.assignSpeakerToSegments(['seg_stats_1'], speaker.id);

      const stats = await LinguisticService.getSpeakerReferenceStats();

      expect(stats[speaker.id]).toEqual({ utteranceCount: 1, segmentCount: 1, totalCount: 2 });
    });

  it('supports token/morpheme lexeme links lifecycle', async () => {
    await LinguisticService.saveTokenLexemeLink({
      id: 'link_tok',
      targetType: 'token',
      targetId: 'tok_1',
      lexemeId: 'lex_tok',
      role: 'manual',
      confidence: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveTokenLexemeLink({
      id: 'link_mor',
      targetType: 'morpheme',
      targetId: 'mor_1',
      lexemeId: 'lex_mor',
      role: 'stem',
      confidence: 0.8,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const tokenLinks = await LinguisticService.getTokenLexemeLinks('token', 'tok_1');
    const morphemeLinks = await LinguisticService.getTokenLexemeLinks('morpheme', 'mor_1');
    expect(tokenLinks).toHaveLength(1);
    expect(morphemeLinks).toHaveLength(1);

    await LinguisticService.removeTokenLexemeLinks('token', 'tok_1');
    expect(await LinguisticService.getTokenLexemeLinks('token', 'tok_1')).toHaveLength(0);
    expect(await LinguisticService.getTokenLexemeLinks('morpheme', 'mor_1')).toHaveLength(1);
  });

  it('generates import quality report with coverage and integrity metrics', async () => {
    await LinguisticService.saveTranslationLayer({
      id: 'layer_trc_quality',
      textId: 'text_quality',
      key: 'trc_quality',
      name: { eng: 'Transcription Quality' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveTranslationLayer({
      id: 'layer_trl_quality',
      textId: 'text_quality',
      key: 'trl_quality',
      name: { eng: 'Translation Quality' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveUtterance({
      id: 'utt_quality_1',
      textId: 'text_quality',
      startTime: 0,
      endTime: 1,
      annotationStatus: 'verified',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveToken({
      id: 'tok_quality_1',
      textId: 'text_quality',
      utteranceId: 'utt_quality_1',
      tokenIndex: 0,
      form: { default: 'tok' },
      gloss: { eng: 'GLOSS' },
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveUtteranceText({
      id: 'utr_quality_trc',
      utteranceId: 'utt_quality_1',
      layerId: 'layer_trc_quality',
      modality: 'text',
      text: 'transcribed',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveUtteranceText({
      id: 'utr_quality_trl',
      utteranceId: 'utt_quality_1',
      layerId: 'layer_trl_quality',
      modality: 'text',
      text: 'translated',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Add one orphan anchor and one orphan note
    await db.anchors.put({ id: 'anc_orphan_quality', mediaId: 'media_orphan', time: 99, createdAt: NOW });
    await db.user_notes.put({
      id: 'note_orphan_quality',
      targetType: 'token',
      targetId: 'non_existing_token',
      parentTargetId: 'utt_quality_1',
      content: { eng: 'orphan-note' },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const report = await LinguisticService.generateImportQualityReport('text_quality');

    expect(report.totals.utterances).toBe(1);
    expect(report.coverage.transcribedUtterances).toBe(1);
    expect(report.coverage.translatedUtterances).toBe(1);
    expect(report.coverage.glossedUtterances).toBe(1);
    expect(report.coverage.verifiedUtterances).toBe(1);
    expect(report.integrity.orphanNotes).toBe(1);
    expect(report.integrity.orphanAnchors).toBe(1);
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
      startTime: 1,
      endTime: 2,
      annotationStatus: 'raw',
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

  it('rejects AI tier annotation writes with confirmed reviewStatus', async () => {
    await db.tier_definitions.put({
      id: 'tier_ai_guard',
      textId: 'text_guard',
      key: 'guard',
      name: { default: 'guard' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      LinguisticService.saveTierAnnotation({
        id: 'ann_ai_guard',
        tierId: 'tier_ai_guard',
        value: 'x',
        startTime: 0,
        endTime: 1,
        isVerified: false,
        provenance: {
          actorType: 'ai',
          method: 'auto-gloss',
          createdAt: NOW,
          reviewStatus: 'confirmed',
        },
        createdAt: NOW,
        updatedAt: NOW,
      }, 'ai'),
    ).rejects.toThrow(/confirmed.*AI/);
  });

  it('removes multiple utterances in one transaction with cascade cleanup', async () => {
    await db.anchors.bulkPut([
      { id: 'anc_s1', mediaId: 'media_batch', time: 0, createdAt: NOW },
      { id: 'anc_e1', mediaId: 'media_batch', time: 1, createdAt: NOW },
      { id: 'anc_s2', mediaId: 'media_batch', time: 1, createdAt: NOW },
      { id: 'anc_e2', mediaId: 'media_batch', time: 2, createdAt: NOW },
    ]);

    await LinguisticService.saveUtterancesBatch([
      {
        id: 'utt_batch_1',
        textId: 'text_batch',
        mediaId: 'media_batch',
        startTime: 0,
        endTime: 1,
        startAnchorId: 'anc_s1',
        endAnchorId: 'anc_e1',
        annotationStatus: 'raw',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utt_batch_2',
        textId: 'text_batch',
        mediaId: 'media_batch',
        startTime: 1,
        endTime: 2,
        startAnchorId: 'anc_s2',
        endAnchorId: 'anc_e2',
        annotationStatus: 'raw',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await LinguisticService.saveTokensBatch([
      {
        id: 'tok_batch_1',
        textId: 'text_batch',
        utteranceId: 'utt_batch_1',
        tokenIndex: 0,
        form: { default: 'a' },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'tok_batch_2',
        textId: 'text_batch',
        utteranceId: 'utt_batch_2',
        tokenIndex: 0,
        form: { default: 'b' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await LinguisticService.saveMorphemesBatch([
      {
        id: 'mor_batch_1',
        textId: 'text_batch',
        utteranceId: 'utt_batch_1',
        tokenId: 'tok_batch_1',
        morphemeIndex: 0,
        form: { default: 'a1' },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'mor_batch_2',
        textId: 'text_batch',
        utteranceId: 'utt_batch_2',
        tokenId: 'tok_batch_2',
        morphemeIndex: 0,
        form: { default: 'b1' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await LinguisticService.saveTokenLexemeLink({
      id: 'link_batch_1',
      targetType: 'token',
      targetId: 'tok_batch_1',
      lexemeId: 'lex_a',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await LinguisticService.saveTokenLexemeLink({
      id: 'link_batch_2',
      targetType: 'morpheme',
      targetId: 'mor_batch_2',
      lexemeId: 'lex_b',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await Promise.all([
      LinguisticService.saveUtteranceText({
        id: 'utr_batch_1',
        utteranceId: 'utt_batch_1',
        layerId: 'layer_batch',
        modality: 'text',
        text: 'x',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      }),
      LinguisticService.saveUtteranceText({
        id: 'utr_batch_2',
        utteranceId: 'utt_batch_2',
        layerId: 'layer_batch',
        modality: 'text',
        text: 'y',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ]);

    await db.user_notes.bulkPut([
      {
        id: 'note_u_batch_1',
        targetType: 'utterance',
        targetId: 'utt_batch_1',
        content: { eng: 'u1' },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'note_t_batch_1',
        targetType: 'token',
        targetId: 'tok_batch_1',
        parentTargetId: 'utt_batch_1',
        content: { eng: 't1' },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'note_m_batch_2',
        targetType: 'morpheme',
        targetId: 'mor_batch_2',
        parentTargetId: 'tok_batch_2',
        content: { eng: 'm2' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await LinguisticService.removeUtterancesBatch(['utt_batch_1', 'utt_batch_2']);

    expect(await db.utterances.where('id').anyOf(['utt_batch_1', 'utt_batch_2']).count()).toBe(0);
    expect(await db.utterance_tokens.where('utteranceId').anyOf(['utt_batch_1', 'utt_batch_2']).count()).toBe(0);
    expect(await db.utterance_morphemes.where('utteranceId').anyOf(['utt_batch_1', 'utt_batch_2']).count()).toBe(0);
    expect(await db.token_lexeme_links.where('id').anyOf(['link_batch_1', 'link_batch_2']).count()).toBe(0);
    expect(await db.user_notes.where('id').anyOf(['note_u_batch_1', 'note_t_batch_1', 'note_m_batch_2']).count()).toBe(0);
    expect(await db.anchors.where('id').anyOf(['anc_s1', 'anc_e1', 'anc_s2', 'anc_e2']).count()).toBe(0);
  });

  it('regression: single/media cascade deletes token_lexeme_links via indexed composite key', async () => {
    await db.media_items.bulkPut([
      {
        id: 'media_del_single',
        textId: 'text_del',
        filename: 'single.wav',
        isOfflineCached: true,
        createdAt: NOW,
      },
      {
        id: 'media_del_audio',
        textId: 'text_del',
        filename: 'audio.wav',
        isOfflineCached: true,
        createdAt: NOW,
      },
    ]);

    await LinguisticService.saveUtterancesBatch([
      {
        id: 'utt_del_single',
        textId: 'text_del',
        mediaId: 'media_del_single',
        startTime: 0,
        endTime: 1,
        annotationStatus: 'raw',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utt_del_audio',
        textId: 'text_del',
        mediaId: 'media_del_audio',
        startTime: 1,
        endTime: 2,
        annotationStatus: 'raw',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await LinguisticService.saveTokensBatch([
      {
        id: 'tok_del_single',
        textId: 'text_del',
        utteranceId: 'utt_del_single',
        tokenIndex: 0,
        form: { default: 'single' },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'tok_del_audio',
        textId: 'text_del',
        utteranceId: 'utt_del_audio',
        tokenIndex: 0,
        form: { default: 'audio' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await LinguisticService.saveMorphemesBatch([
      {
        id: 'mor_del_single',
        textId: 'text_del',
        utteranceId: 'utt_del_single',
        tokenId: 'tok_del_single',
        morphemeIndex: 0,
        form: { default: 'single-m' },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'mor_del_audio',
        textId: 'text_del',
        utteranceId: 'utt_del_audio',
        tokenId: 'tok_del_audio',
        morphemeIndex: 0,
        form: { default: 'audio-m' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await db.token_lexeme_links.bulkPut([
      {
        id: 'link_del_single_tok',
        targetType: 'token',
        targetId: 'tok_del_single',
        lexemeId: 'lex_single_tok',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'link_del_single_mor',
        targetType: 'morpheme',
        targetId: 'mor_del_single',
        lexemeId: 'lex_single_mor',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'link_del_audio_tok',
        targetType: 'token',
        targetId: 'tok_del_audio',
        lexemeId: 'lex_audio_tok',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'link_del_audio_mor',
        targetType: 'morpheme',
        targetId: 'mor_del_audio',
        lexemeId: 'lex_audio_mor',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await expect(LinguisticService.removeUtterance('utt_del_single')).resolves.toBeUndefined();
    expect(await db.token_lexeme_links.where('id').anyOf(['link_del_single_tok', 'link_del_single_mor']).count()).toBe(0);
    expect(await db.token_lexeme_links.where('id').anyOf(['link_del_audio_tok', 'link_del_audio_mor']).count()).toBe(2);

    await expect(LinguisticService.deleteAudio('media_del_audio')).resolves.toBeUndefined();
    expect(await db.token_lexeme_links.where('id').anyOf(['link_del_audio_tok', 'link_del_audio_mor']).count()).toBe(0);
  });

  // ── Regression guard: segmentation text queries ──────

  it('regression: saveUtteranceText round-trips via layer-field index', async () => {
    await LinguisticService.saveUtterance({
      id: 'utt_layer_rt',
      textId: 'text_layer_rt',
      startTime: 0,
      endTime: 1,
      annotationStatus: 'raw',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveUtteranceText({
      id: 'utr_layer_rt_1',
      utteranceId: 'utt_layer_rt',
      layerId: 'layer_trc_rt',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveUtteranceText({
      id: 'utr_layer_rt_2',
      utteranceId: 'utt_layer_rt',
      layerId: 'layer_trl_rt',
      modality: 'text',
      text: 'world',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Query by utteranceId should return both (via V2 read path)
    const texts = await LinguisticService.getUtteranceTexts('utt_layer_rt');
    expect(texts).toHaveLength(2);

    // Canonical layer_unit_contents should have both entries
    const v2Contents = await db.layer_unit_contents
      .where('layerId')
      .equals('layer_trc_rt')
      .toArray();
    expect(v2Contents).toHaveLength(1);
    expect(v2Contents[0]!.text).toBe('hello');

    // Cascade delete via removeUtterance should clean up V2 entries
    await LinguisticService.removeUtterance('utt_layer_rt');
    const remaining = await LinguisticService.getUtteranceTexts('utt_layer_rt');
    expect(remaining).toHaveLength(0);
  });

  it('regression: deleteProject cascades segmentation text content via utteranceId query', async () => {
    await db.texts.put({
      id: 'text_cascade_ut',
      title: { eng: 'Cascade Test' },
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveUtterance({
      id: 'utt_cascade_ut_1',
      textId: 'text_cascade_ut',
      startTime: 0,
      endTime: 1,
      annotationStatus: 'raw',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LinguisticService.saveUtteranceText({
      id: 'utr_cascade_ut_1',
      utteranceId: 'utt_cascade_ut_1',
      layerId: 'layer_cascade',
      modality: 'text',
      text: 'cascade me',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Canonical graph should have the content after save
    expect(await db.layer_unit_contents.count()).toBeGreaterThan(0);

    await LinguisticService.deleteProject('text_cascade_ut');

    // Canonical cascade should clean up segment contents
    expect(await db.layer_unit_contents.where('layerId').equals('layer_cascade').count()).toBe(0);
    expect(await db.utterances.count()).toBe(0);
  });

  it('regression: upsertLanguageCatalogEntry clears explicitly blank persisted fields', async () => {
    await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:demo-language',
      languageCode: 'demo',
      locale: 'zh-CN',
      localName: '示例语言',
      englishName: 'Demo Language',
      nativeName: 'Demo Native',
      canonicalTag: 'und-Latn',
      iso6391: 'dm',
      iso6392B: 'dem',
      iso6392T: 'deo',
      iso6393: 'dmo',
      glottocode: 'demo1234',
      wikidataId: 'Q123456',
      genus: 'Demo Genus',
      classificationPath: 'Demo Family > Demo Branch',
      macrolanguage: 'demo-macro',
      aliases: ['示例别名'],
      displayNames: [{ locale: 'fr-FR', role: 'preferred', value: 'langue de demonstration' }],
    });

    const clearInput: Record<string, unknown> = {
      id: 'user:demo-language',
      languageCode: 'demo',
      locale: 'zh-CN',
      localName: '',
      englishName: '',
      nativeName: '',
      canonicalTag: '',
      iso6391: '',
      iso6392B: '',
      iso6392T: '',
      iso6393: '',
      glottocode: '',
      wikidataId: '',
      genus: '',
      classificationPath: '',
      macrolanguage: '',
      aliases: [],
      displayNames: [],
      scope: undefined,
      modality: undefined,
      languageType: undefined,
    };

    await LinguisticService.upsertLanguageCatalogEntry(clearInput as Parameters<typeof LinguisticService.upsertLanguageCatalogEntry>[0]);

    const saved = await db.languages.get('user:demo-language');
    expect(saved).toBeTruthy();
    expect(saved?.name).toEqual({});
    expect(saved?.autonym).toBeUndefined();
    expect(saved?.canonicalTag).toBeUndefined();
    expect(saved?.iso6391).toBeUndefined();
    expect(saved?.iso6392B).toBeUndefined();
    expect(saved?.iso6392T).toBeUndefined();
    expect(saved?.iso6393).toBeUndefined();
    expect(saved?.glottocode).toBeUndefined();
    expect(saved?.wikidataId).toBeUndefined();
    expect(saved?.genus).toBeUndefined();
    expect(saved?.classificationPath).toBeUndefined();
    expect(saved?.macrolanguage).toBeUndefined();
    expect(saved?.scope).toBeUndefined();
    expect(saved?.modality).toBeUndefined();
    expect(saved?.languageType).toBeUndefined();
    expect(await db.language_display_names.where('languageId').equals('user:demo-language').count()).toBe(0);
    expect(await db.language_aliases.where('languageId').equals('user:demo-language').count()).toBe(0);
  });

  it('regression: upsertLanguageCatalogEntry replaces custom fields so single-key clears persist', async () => {
    await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:custom-fields-language',
      languageCode: 'cfl',
      locale: 'zh-CN',
      localName: '自定义字段语言',
      englishName: 'Custom Fields Language',
      customFields: {
        fieldText: 'alpha',
        fieldNumber: 42,
      },
    });

    await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:custom-fields-language',
      languageCode: 'cfl',
      locale: 'zh-CN',
      localName: '自定义字段语言',
      englishName: 'Custom Fields Language',
      customFields: {
        fieldNumber: 42,
      },
    });

    const saved = await db.languages.get('user:custom-fields-language');
    expect(saved?.customFields).toEqual({ fieldNumber: 42 });
  });

  it('regression: deleting a custom field definition cascades persisted language values', async () => {
    const keepDefinition = await LinguisticService.upsertCustomFieldDefinition({
      name: { 'zh-CN': '保留字段' },
      fieldType: 'text',
    });
    const removedDefinition = await LinguisticService.upsertCustomFieldDefinition({
      name: { 'zh-CN': '删除字段' },
      fieldType: 'text',
    });

    await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:custom-field-delete',
      languageCode: 'cfd',
      locale: 'zh-CN',
      localName: '删除字段语言',
      englishName: 'Deleted Field Language',
      customFields: {
        [keepDefinition.id]: 'keep',
        [removedDefinition.id]: 'remove',
      },
    });

    await LinguisticService.deleteCustomFieldDefinition(removedDefinition.id);

    const saved = await db.languages.get('user:custom-field-delete');
    expect(saved?.customFields).toEqual({
      [keepDefinition.id]: 'keep',
    });

    const entry = await LinguisticService.getLanguageCatalogEntry({
      languageId: 'user:custom-field-delete',
      locale: 'zh-CN',
    });
    expect(entry?.customFields).toEqual({
      [keepDefinition.id]: 'keep',
    });
  });

  it('regression: deleting the last custom field definition removes persisted customFields entirely', async () => {
    const removedDefinition = await LinguisticService.upsertCustomFieldDefinition({
      name: { 'zh-CN': '唯一字段' },
      fieldType: 'text',
    });

    await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:custom-field-delete-last',
      languageCode: 'cfe',
      locale: 'zh-CN',
      localName: '最后字段语言',
      englishName: 'Last Field Language',
      customFields: {
        [removedDefinition.id]: 'remove',
      },
    });

    await LinguisticService.deleteCustomFieldDefinition(removedDefinition.id);

    const saved = await db.languages.get('user:custom-field-delete-last');
    expect(saved?.customFields).toBeUndefined();

    const entry = await LinguisticService.getLanguageCatalogEntry({
      languageId: 'user:custom-field-delete-last',
      locale: 'zh-CN',
    });
    expect(entry?.customFields).toBeUndefined();
  });

  it('rejects conflicting or highly ambiguous aliases before saving', async () => {
    await expect(LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:conflict-language',
      languageCode: 'demo',
      locale: 'zh-CN',
      localName: '冲突语言',
      englishName: 'Conflict Language',
      aliases: ['Chinese'],
    })).rejects.toThrow('别名“Chinese”属于高频泛称');
  });

  it('rehydrates the runtime language read model from persisted catalog data', async () => {
    await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:demo-language',
      languageCode: 'demo',
      locale: 'zh-CN',
      localName: '示例语言',
      englishName: 'Demo Language',
      aliases: ['示例别名'],
    });

    clearLanguageCatalogRuntimeCache();
    expect(getLanguageLocalDisplayNameFromCatalog('demo', 'zh-CN')).toBeUndefined();
    expect(resolveLanguageQuery('示例别名')).toBeUndefined();

    await LinguisticService.refreshLanguageCatalogReadModel();

    expect(getLanguageLocalDisplayNameFromCatalog('demo', 'zh-CN')).toBe('示例语言');
    expect(resolveLanguageQuery('示例别名')).toBe('demo');
  });

  it('records detailed changed fields and reason in language catalog history', async () => {
    await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:history-language',
      languageCode: 'hst',
      locale: 'zh-CN',
      localName: '历史语言',
      englishName: 'History Language',
      aliases: ['历史别名'],
      reason: '初始化自定义语言条目',
    });

    await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:history-language',
      languageCode: 'hst',
      locale: 'zh-CN',
      localName: '历史语言新版',
      englishName: 'History Language Revised',
      aliases: ['历史别名新版'],
      canonicalTag: 'zh-hans-cn',
      displayNames: [{ locale: 'fr-fr', role: 'menu', value: 'langue historique' }],
      reason: '补充法语菜单名并统一 canonical tag',
    });

    const history = await LinguisticService.listLanguageCatalogHistory('user:history-language');
    const latest = history[0];
    expect(latest).toBeTruthy();
    expect(latest?.reason).toBe('补充法语菜单名并统一 canonical tag');
    expect(latest?.reasonCode).toBe('user-provided');
    expect(latest?.changedFields).toEqual(expect.arrayContaining(['localName', 'englishName', 'aliases', 'canonicalTag', 'displayNames']));
    expect(latest?.beforePatch).toEqual(expect.objectContaining({
      localName: '历史语言',
      englishName: 'History Language',
      aliases: ['历史别名'],
    }));
    expect(latest?.afterPatch).toEqual(expect.objectContaining({
      localName: '历史语言新版',
      englishName: 'History Language Revised',
      aliases: ['历史别名新版'],
      canonicalTag: 'zh-Hans-CN',
    }));
  });

  it('validates canonical tags and display-name locales before saving', async () => {
    await expect(LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:invalid-tag',
      languageCode: 'bad',
      locale: 'zh-CN',
      localName: '非法标签语言',
      canonicalTag: 'not a tag',
    })).rejects.toThrow('Canonical Tag 不是合法的 BCP 47 语言标签');

    await expect(LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:invalid-locale',
      languageCode: 'bad',
      locale: 'zh-CN',
      localName: '非法 locale 语言',
      displayNames: [{ locale: 'bad locale', role: 'preferred', value: 'bad locale label' }],
    })).rejects.toThrow('显示名称矩阵中的 locale 必须是合法的 BCP 47 locale key');
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

  it('saveTierAnnotationsBatch rolls back earlier writes when a later annotation fails', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);
    await db.media_items.put({
      id: 'media_batch_tx',
      textId: 'text_1',
      filename: 'batch.wav',
      details: {},
      isOfflineCached: true,
      createdAt: NOW,
    });

    const anns = [
      makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 2 }),
      makeAnn({ id: 'a2', tierId: 'td1', startTime: 2, endTime: 4 }),
    ];

    const originalPut = db.audit_logs.put.bind(db.audit_logs);
    const auditLogCountBefore = (await db.audit_logs.toArray()).length;
    const putSpy = vi.spyOn(db.audit_logs, 'put').mockImplementation((value: AuditLogDocType) => {
      if (value.documentId === 'a2') {
        throw new Error('audit boom');
      }
      return originalPut(value);
    });

    try {
      await expect(LinguisticService.saveTierAnnotationsBatch('text_1', anns)).rejects.toThrow('audit boom');

      expect(await LinguisticService.getTierAnnotations('td1')).toHaveLength(0);
      expect((await db.audit_logs.toArray()).length).toBe(auditLogCountBefore);
      expect(await db.anchors.toArray()).toHaveLength(0);
    } finally {
      putSpy.mockRestore();
    }
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

// ── Validated CRUD tests ───────────────────────────────────────

describe('Validated single-item CRUD', () => {
  beforeEach(async () => {
    await db.open();
    await clearDatabase();
  });

  // saveTierAnnotation — validation
  it('saveTierAnnotation blocks save on T2 overlap error', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);

    // First annotation succeeds
    const r1 = await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 3 }),
    );
    expect(r1.errors).toHaveLength(0);
    expect(r1.id).toBeTruthy();

    // Overlapping annotation is blocked
    const r2 = await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'a2', tierId: 'td1', startTime: 2, endTime: 5 }),
    );
    expect(r2.errors.length).toBeGreaterThan(0);
    expect(r2.errors.some((e) => e.rule === 'T2')).toBe(true);
    expect(r2.id).toBe('');

    // Only first annotation persisted
    const stored = await LinguisticService.getTierAnnotations('td1');
    expect(stored).toHaveLength(1);
  });

  it('saveTierAnnotation returns warnings for T4 coverage gap', async () => {
    const root = makeTier({ id: 'td1', textId: 'text_1', key: 'utt', tierType: 'time-aligned' });
    const sub = makeTier({ id: 'td2', textId: 'text_1', key: 'word', tierType: 'time-subdivision', parentTierId: 'td1' });
    await LinguisticService.saveTierDefinition(root);
    await LinguisticService.saveTierDefinition(sub);

    // Root annotation
    await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 10 }),
    );

    // Subdivision only covers part of parent → T4 warning, but save proceeds
    const r = await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'a2', tierId: 'td2', parentAnnotationId: 'a1', startTime: 0, endTime: 5 }),
    );
    expect(r.errors).toHaveLength(0);
    expect(r.id).toBeTruthy();
    expect(r.warnings.some((w) => w.rule === 'T4')).toBe(true);
  });

  it('saveTierAnnotation rejects reference to non-existent tier', async () => {
    const r = await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'a1', tierId: 'ghost', startTime: 0, endTime: 1 }),
    );
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.rule).toBe('R2');
    expect(r.id).toBe('');
  });

  // saveTierDefinition — validation
  it('saveTierDefinition blocks save on S6 incompatible parent type', async () => {
    const root = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'symbolic-association' });
    await LinguisticService.saveTierDefinition(root);

    // time-subdivision cannot have symbolic-association parent
    const child = makeTier({ id: 'td2', textId: 'text_1', key: 'sub', tierType: 'time-subdivision', parentTierId: 'td1' });
    const r = await LinguisticService.saveTierDefinition(child);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.some((e) => e.rule === 'S6')).toBe(true);
    expect(r.id).toBe('');

    // Child tier should not be in the database
    const defs = await LinguisticService.getTierDefinitions('text_1');
    expect(defs).toHaveLength(1);
    expect(defs[0]!.id).toBe('td1');
  });

  it('saveTierDefinition blocks save on R1 non-existent parent', async () => {
    const child = makeTier({ id: 'td1', textId: 'text_1', key: 'orphan', tierType: 'time-subdivision', parentTierId: 'ghost' });
    const r = await LinguisticService.saveTierDefinition(child);
    expect(r.errors.some((e) => e.rule === 'R1')).toBe(true);
    expect(r.id).toBe('');
  });

  // removeTierDefinition — cascade + child tier rejection
  it('removeTierDefinition cascades to annotations', async () => {
    const tier = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    await LinguisticService.saveTierDefinition(tier);
    await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 1 }),
    );
    await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'a2', tierId: 'td1', startTime: 1, endTime: 2 }),
    );

    const result = await LinguisticService.removeTierDefinition('td1');
    expect(result.errors).toHaveLength(0);

    // Annotations should be gone too
    const anns = await LinguisticService.getTierAnnotations('td1');
    expect(anns).toHaveLength(0);
  });

  it('removeTierDefinition rejects when child tiers depend on it', async () => {
    const root = makeTier({ id: 'td1', textId: 'text_1', key: 'root', tierType: 'time-aligned' });
    const child = makeTier({ id: 'td2', textId: 'text_1', key: 'child', tierType: 'symbolic-subdivision', parentTierId: 'td1' });
    await LinguisticService.saveTierDefinition(root);
    await LinguisticService.saveTierDefinition(child);

    const result = await LinguisticService.removeTierDefinition('td1');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.rule).toBe('CASCADE');

    // Root tier should still exist
    const defs = await LinguisticService.getTierDefinitions('text_1');
    expect(defs).toHaveLength(2);
  });

  // removeTierAnnotation — cascade to child annotations
  it('removeTierAnnotation cascades to child annotations', async () => {
    const root = makeTier({ id: 'td1', textId: 'text_1', key: 'utt', tierType: 'time-aligned' });
    const sub = makeTier({ id: 'td2', textId: 'text_1', key: 'morph', tierType: 'symbolic-subdivision', parentTierId: 'td1' });
    await LinguisticService.saveTierDefinition(root);
    await LinguisticService.saveTierDefinition(sub);

    await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 2 }),
    );
    await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'm1', tierId: 'td2', parentAnnotationId: 'a1', ordinal: 0 }),
    );
    await LinguisticService.saveTierAnnotation(
      makeAnn({ id: 'm2', tierId: 'td2', parentAnnotationId: 'a1', ordinal: 1 }),
    );

    // Removing parent also removes children
    await LinguisticService.removeTierAnnotation('a1');
    const rootAnns = await LinguisticService.getTierAnnotations('td1');
    const childAnns = await LinguisticService.getTierAnnotations('td2');
    expect(rootAnns).toHaveLength(0);
    expect(childAnns).toHaveLength(0);
  });

  // saveTierAnnotationsBatch returns warnings
  it('saveTierAnnotationsBatch returns warnings for T4', async () => {
    const root = makeTier({ id: 'td1', textId: 'text_1', key: 'utt', tierType: 'time-aligned' });
    const sub = makeTier({ id: 'td2', textId: 'text_1', key: 'word', tierType: 'time-subdivision', parentTierId: 'td1' });
    await LinguisticService.saveTierDefinition(root);
    await LinguisticService.saveTierDefinition(sub);

    const anns = [
      makeAnn({ id: 'a1', tierId: 'td1', startTime: 0, endTime: 10 }),
      makeAnn({ id: 'a2', tierId: 'td2', parentAnnotationId: 'a1', startTime: 0, endTime: 5 }),
      // gap 5-10 → T4 warning
    ];

    const result = await LinguisticService.saveTierAnnotationsBatch('text_1', anns);
    expect(result.violations).toHaveLength(0);
    expect(result.warnings.some((w) => w.rule === 'T4')).toBe(true);

    // Annotations still saved despite warning
    const stored = await LinguisticService.getTierAnnotations('td1');
    expect(stored).toHaveLength(1);
  });
});

// ── Language catalog Service facade ───────────────────────────

describe('searchLanguageCatalogEntries', () => {
  it('returns matches for a known language name', () => {
    const results = LinguisticService.searchLanguageCatalogEntries('English', 'en-US', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.entry.iso6393).toBe('eng');
  });

  it('returns empty suggestions for empty query (common languages fallback)', () => {
    const results = LinguisticService.searchLanguageCatalogEntries('', 'zh-CN', 5);
    // 空查询返回常见语言列表 | Empty query returns common language list
    expect(Array.isArray(results)).toBe(true);
  });

  it('lists persisted entries when search hits number, boolean, or multiselect custom fields', async () => {
    await LinguisticService.upsertLanguageCatalogEntry({
      id: 'user:search-custom-fields',
      languageCode: 'scf',
      locale: 'zh-CN',
      localName: '搜索字段语言',
      englishName: 'Search Field Language',
      customFields: {
        numericField: 1200,
        booleanField: true,
        multiselectField: ['plateau', 'river'],
      },
    });

    await expect(LinguisticService.listLanguageCatalogEntries({
      locale: 'zh-CN',
      searchText: '1200',
      includeHidden: true,
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'user:search-custom-fields' }),
    ]));

    await expect(LinguisticService.listLanguageCatalogEntries({
      locale: 'zh-CN',
      searchText: 'true',
      includeHidden: true,
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'user:search-custom-fields' }),
    ]));

    await expect(LinguisticService.listLanguageCatalogEntries({
      locale: 'zh-CN',
      searchText: 'river',
      includeHidden: true,
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'user:search-custom-fields' }),
    ]));
  });
});

describe('resolveLanguageQuery', () => {
  it('resolves a known ISO 639-3 code directly', () => {
    expect(LinguisticService.resolveLanguageQuery('eng')).toBe('eng');
  });

  it('resolves a Chinese language name to ISO code', () => {
    expect(LinguisticService.resolveLanguageQuery('英语')).toBe('eng');
  });

  it('returns undefined for unrecognised input', () => {
    expect(LinguisticService.resolveLanguageQuery('xyznonexistent')).toBeUndefined();
  });
});
