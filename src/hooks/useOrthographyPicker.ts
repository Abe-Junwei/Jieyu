import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MultiLangString, OrthographyDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import {
  resolveOrthographyRenderPolicy,
  type OrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import {
  buildTransformRulesFromRuleText,
  evaluateOrthographyTransformSampleCases,
  parseTransformSampleCases,
  previewOrthographyTransform,
  validateOrthographyTransform,
} from '../utils/orthographyTransforms';
import { COMMON_LANGUAGES } from '../utils/transcriptionFormatters';
import { useOrthographies } from './useOrthographies';

export const ORTHOGRAPHY_CREATE_SENTINEL = '__create_new_orthography__';

export type OrthographyCreateMode = 'ipa' | 'copy-current' | 'derive-other';

function resolveLanguageLabel(languageId: string): string {
  const matched = COMMON_LANGUAGES.find((item) => item.code === languageId);
  return matched?.label ?? languageId.toUpperCase();
}

function buildOrthographyNameMap(input: {
  languageId: string;
  nameZh: string;
  nameEn: string;
  abbreviation: string;
  fallback?: string;
}): MultiLangString {
  const name: MultiLangString = {};
  const zh = input.nameZh.trim();
  const en = input.nameEn.trim();
  const abbreviation = input.abbreviation.trim();
  const fallback = input.fallback?.trim();

  if (zh) name.zho = zh;
  if (en) name.eng = en;

  if (!name.zho && !name.eng) {
    const languageLabel = resolveLanguageLabel(input.languageId);
    const resolved = fallback || abbreviation || `${languageLabel} \u6b63\u5b57\u6cd5`;
    name.zho = resolved;
    name.eng = fallback || abbreviation || `${input.languageId.toUpperCase()} orthography`;
  }

  return name;
}

function buildIpaSeed(languageId: string) {
  const languageLabel = resolveLanguageLabel(languageId);
  return {
    nameZh: `${languageLabel} IPA`,
    nameEn: `${inputLanguageToEnglishLabel(languageId)} IPA`,
    abbreviation: 'IPA',
    scriptTag: 'Latn',
    type: 'phonetic' as const,
  };
}

function inputLanguageToEnglishLabel(languageId: string): string {
  const matched = COMMON_LANGUAGES.find((item) => item.code === languageId);
  return matched?.label ?? languageId.toUpperCase();
}

function buildSeedFromOrthography(source: OrthographyDocType | undefined) {
  return {
    nameZh: source?.name?.zho ?? source?.name?.zh ?? '',
    nameEn: source?.name?.eng ?? source?.name?.en ?? '',
    abbreviation: source?.abbreviation ?? '',
    scriptTag: source?.scriptTag ?? '',
    type: source?.type ?? ('practical' as const),
    localeTag: source?.localeTag ?? '',
    regionTag: source?.regionTag ?? '',
    variantTag: source?.variantTag ?? '',
    direction: source?.direction ?? defaultDirectionForScript(source?.scriptTag),
    exemplarMain: (source?.exemplarCharacters?.main ?? []).join(', '),
    primaryFonts: (source?.fontPreferences?.primary ?? []).join(', '),
    fallbackFonts: (source?.fontPreferences?.fallback ?? []).join(', '),
    bidiIsolate: source?.bidiPolicy?.isolateInlineRuns ?? (source?.direction === 'rtl'),
    preferDirAttribute: source?.bidiPolicy?.preferDirAttribute ?? true,
    transformEngine: resolveTransformEngine(source),
    transformRuleText: resolveTransformRuleText(source),
  };
}

function defaultDirectionForScript(scriptTag?: string): NonNullable<OrthographyDocType['direction']> {
  return scriptTag === 'Arab' || scriptTag === 'Hebr' ? 'rtl' : 'ltr';
}

function parseDraftList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveTransformEngine(source: OrthographyDocType | undefined): 'table-map' | 'icu-rule' | 'manual' {
  const engine = (source?.conversionRules as { engine?: string } | undefined)?.engine;
  return engine === 'icu-rule' || engine === 'manual' ? engine : 'table-map';
}

function resolveTransformRuleText(source: OrthographyDocType | undefined): string {
  const conversionRules = source?.conversionRules as {
    ruleText?: string;
    rules?: { ruleText?: string };
  } | undefined;
  return conversionRules?.rules?.ruleText ?? conversionRules?.ruleText ?? '';
}

export function formatOrthographyOptionLabel(orthography: {
  name?: Record<string, string>;
  abbreviation?: string;
  scriptTag?: string;
  type?: string;
}): string {
  const name = orthography.name?.zho
    ?? orthography.name?.zh
    ?? orthography.name?.eng
    ?? orthography.name?.en
    ?? orthography.abbreviation
    ?? '\u672a\u547d\u540d\u6b63\u5b57\u6cd5';
  const extras = [orthography.scriptTag, orthography.type].filter(Boolean).join(' · ');
  return extras ? `${name} · ${extras}` : name;
}

function mergeOrthographies(
  base: OrthographyDocType[],
  appended: OrthographyDocType[],
): OrthographyDocType[] {
  const deduped = new Map<string, OrthographyDocType>();
  [...base, ...appended].forEach((orthography) => {
    deduped.set(orthography.id, orthography);
  });
  return Array.from(deduped.values());
}

function buildOrthographyPreviewSampleText(scriptTag: string, exemplarSample: string): string {
  if (exemplarSample.trim()) return exemplarSample;
  switch (scriptTag) {
    case 'Arab': return 'ابجد ١٢٣';
    case 'Hebr': return 'אבגד 123';
    case 'Deva': return 'कखग १२३';
    case 'Hans': return '\u793a\u4f8b\u6587\u672c 123';
    case 'Hant': return '\u793a\u4f8b\u6587\u672c 123';
    case 'Jpan': return '\u304b\u306a\u6f22\u5b57 123';
    case 'Kore': return '한글 예시 123';
    case 'Tibt': return 'བོད་ཡིག ༡༢༣';
    default: return 'Aa Bb 123';
  }
}

function buildDraftRenderWarnings(input: {
  draftRenderPolicy?: OrthographyRenderPolicy;
  draftPrimaryFonts: string;
  draftFallbackFonts: string;
  draftBidiIsolate: boolean;
}): string[] {
  const warnings: string[] = [];
  const coverageWarning = input.draftRenderPolicy?.coverageSummary.warning;
  if (coverageWarning) warnings.push(coverageWarning);

  const hasCustomFontPreference = input.draftPrimaryFonts.trim().length > 0 || input.draftFallbackFonts.trim().length > 0;
  if (hasCustomFontPreference && input.draftRenderPolicy?.coverageSummary.confidence === 'script-only') {
    warnings.push('\u5df2\u6307\u5b9a\u9996\u9009\u6216\u56de\u9000\u5b57\u4f53\uff0c\u4f46\u672a\u914d\u7f6e\u793a\u4f8b\u5b57\u7b26\uff0c\u5f53\u524d\u65e0\u6cd5\u5224\u65ad\u771f\u5b9e\u8986\u76d6\u7387\u3002');
  }

  if (input.draftRenderPolicy?.textDirection === 'rtl' && !input.draftBidiIsolate) {
    warnings.push('RTL \u6b63\u5b57\u6cd5\u901a\u5e38\u5efa\u8bae\u5f00\u542f\u201c\u884c\u5185\u53cc\u5411\u6587\u672c\u542f\u7528\u9694\u79bb\u201d\uff0c\u4ee5\u964d\u4f4e\u6df7\u6392\u4e32\u6270\u98ce\u9669\u3002');
  }

  return Array.from(new Set(warnings));
}

export function useOrthographyPicker(
  languageId: string,
  value: string,
  onChange: (nextId: string) => void,
) {
  const [localCreatedOrthographies, setLocalCreatedOrthographies] = useState<OrthographyDocType[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createMode, setCreateMode] = useState<OrthographyCreateMode>('ipa');
  const [sourceLanguageId, setSourceLanguageId] = useState('');
  const [sourceCustomLanguageId, setSourceCustomLanguageId] = useState('');
  const [sourceOrthographyId, setSourceOrthographyId] = useState('');
  const [draftNameZh, setDraftNameZh] = useState('');
  const [draftNameEn, setDraftNameEn] = useState('');
  const [draftAbbreviation, setDraftAbbreviation] = useState('');
  const [draftScriptTag, setDraftScriptTag] = useState('');
  const [draftType, setDraftType] = useState<NonNullable<OrthographyDocType['type']>>('practical');
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [draftLocaleTag, setDraftLocaleTag] = useState('');
  const [draftRegionTag, setDraftRegionTag] = useState('');
  const [draftVariantTag, setDraftVariantTag] = useState('');
  const [draftDirection, setDraftDirection] = useState<NonNullable<OrthographyDocType['direction']>>('ltr');
  const [draftExemplarMain, setDraftExemplarMain] = useState('');
  const [draftPrimaryFonts, setDraftPrimaryFonts] = useState('');
  const [draftFallbackFonts, setDraftFallbackFonts] = useState('');
  const [draftBidiIsolate, setDraftBidiIsolate] = useState(false);
  const [draftPreferDirAttribute, setDraftPreferDirAttribute] = useState(true);
  const [transformEnabled, setTransformEnabled] = useState(false);
  const [draftTransformEngine, setDraftTransformEngine] = useState<'table-map' | 'icu-rule' | 'manual'>('table-map');
  const [draftTransformRuleText, setDraftTransformRuleText] = useState('');
  const [draftTransformSampleInput, setDraftTransformSampleInput] = useState('');
  const [draftTransformSampleCasesText, setDraftTransformSampleCasesText] = useState('');
  const [draftTransformIsReversible, setDraftTransformIsReversible] = useState(false);
  const [renderWarningsAcknowledged, setRenderWarningsAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchedOrthographies = useOrthographies(languageId ? [languageId] : []);
  const orthographies = useMemo(
    () => mergeOrthographies(fetchedOrthographies, localCreatedOrthographies),
    [fetchedOrthographies, localCreatedOrthographies],
  );

  const resolvedSourceLanguageId = useMemo(() => {
    if (createMode === 'copy-current') return languageId;
    if (createMode !== 'derive-other') return '';
    return sourceLanguageId === '__custom__' ? sourceCustomLanguageId.trim() : sourceLanguageId;
  }, [createMode, languageId, sourceCustomLanguageId, sourceLanguageId]);
  const fetchedSourceOrthographies = useOrthographies(resolvedSourceLanguageId ? [resolvedSourceLanguageId] : []);
  const sourceOrthographies = useMemo(() => {
    if (createMode === 'copy-current') return orthographies;
    if (createMode !== 'derive-other') return [];
    return fetchedSourceOrthographies.filter((orthography) => orthography.languageId !== languageId || resolvedSourceLanguageId !== languageId);
  }, [createMode, fetchedSourceOrthographies, languageId, orthographies, resolvedSourceLanguageId]);
  const selectedSourceOrthography = useMemo(
    () => sourceOrthographies.find((orthography) => orthography.id === sourceOrthographyId),
    [sourceOrthographies, sourceOrthographyId],
  );
  const canConfigureTransform = createMode !== 'ipa' && Boolean(selectedSourceOrthography ?? sourceOrthographies[0]);
  const transformDraftRules = useMemo(() => buildTransformRulesFromRuleText(draftTransformRuleText, { caseSensitive: true }), [draftTransformRuleText]);
  const transformDraftSampleCases = useMemo(() => parseTransformSampleCases(draftTransformSampleCasesText), [draftTransformSampleCasesText]);
  const transformValidationIssues = useMemo(() => {
    if (!transformEnabled || !canConfigureTransform) return [];
    return validateOrthographyTransform({
      engine: draftTransformEngine,
      rules: transformDraftRules,
    }).issues;
  }, [canConfigureTransform, draftTransformEngine, transformDraftRules, transformEnabled]);
  const transformSampleCaseResults = useMemo(() => {
    if (!transformEnabled || !canConfigureTransform || transformDraftSampleCases.length === 0) return [];
    return evaluateOrthographyTransformSampleCases({
      engine: draftTransformEngine,
      rules: transformDraftRules,
      sampleCases: transformDraftSampleCases,
    });
  }, [canConfigureTransform, draftTransformEngine, transformDraftRules, transformDraftSampleCases, transformEnabled]);
  const transformPreviewOutput = useMemo(() => {
    if (!transformEnabled) return '';
    const sampleInput = draftTransformSampleInput.trim();
    if (!sampleInput) return '';
    return previewOrthographyTransform({
      engine: draftTransformEngine,
      rules: transformDraftRules,
      text: sampleInput,
    });
  }, [draftTransformEngine, draftTransformSampleInput, transformDraftRules, transformEnabled]);
  const draftRenderPolicy = useMemo<OrthographyRenderPolicy | undefined>(() => {
    if (!languageId) return undefined;
    const trimmedScriptTag = draftScriptTag.trim();
    const exemplarMain = parseDraftList(draftExemplarMain);
    const primaryFonts = parseDraftList(draftPrimaryFonts);
    const fallbackFonts = parseDraftList(draftFallbackFonts);
    const previewOrthography: OrthographyDocType = {
      id: '__draft_preview__',
      languageId,
      name: buildOrthographyNameMap({
        languageId,
        nameZh: draftNameZh,
        nameEn: draftNameEn,
        abbreviation: draftAbbreviation,
        fallback: '\u9884\u89c8\u6b63\u5b57\u6cd5',
      }),
      ...(trimmedScriptTag ? { scriptTag: trimmedScriptTag } : {}),
      direction: draftDirection,
      type: draftType,
      ...(exemplarMain.length ? { exemplarCharacters: { main: exemplarMain } } : {}),
      ...((primaryFonts.length || fallbackFonts.length)
        ? {
          fontPreferences: {
            ...(primaryFonts.length ? { primary: primaryFonts } : {}),
            ...(fallbackFonts.length ? { fallback: fallbackFonts } : {}),
          },
        }
        : {}),
      bidiPolicy: {
        isolateInlineRuns: draftBidiIsolate,
        preferDirAttribute: draftPreferDirAttribute,
      },
      createdAt: 'draft-preview',
    };
    return resolveOrthographyRenderPolicy(languageId, [previewOrthography], previewOrthography.id);
  }, [draftAbbreviation, draftBidiIsolate, draftDirection, draftExemplarMain, draftFallbackFonts, draftNameEn, draftNameZh, draftPreferDirAttribute, draftPrimaryFonts, draftScriptTag, draftType, languageId]);
  const draftRenderPreviewText = useMemo(() => {
    if (!draftRenderPolicy) return '';
    return buildOrthographyPreviewSampleText(draftRenderPolicy.scriptTag, draftRenderPolicy.coverageSummary.exemplarSample);
  }, [draftRenderPolicy]);
  const draftRenderWarnings = useMemo(() => buildDraftRenderWarnings({
    draftPrimaryFonts,
    draftFallbackFonts,
    draftBidiIsolate,
    ...(draftRenderPolicy !== undefined ? { draftRenderPolicy } : {}),
  }), [draftBidiIsolate, draftFallbackFonts, draftPrimaryFonts, draftRenderPolicy]);
  const requiresRenderWarningConfirmation = draftRenderWarnings.length > 0 && !renderWarningsAcknowledged;

  useEffect(() => {
    setRenderWarningsAcknowledged(false);
  }, [draftRenderWarnings.join('\u0000')]);

  useEffect(() => {
    setLocalCreatedOrthographies([]);
    setIsCreating(false);
    setCreateMode('ipa');
    setSourceLanguageId('');
    setSourceCustomLanguageId('');
    setSourceOrthographyId('');
    setDraftNameZh('');
    setDraftNameEn('');
    setDraftAbbreviation('');
    setDraftScriptTag('');
    setDraftType('practical');
    setShowAdvancedFields(false);
    setDraftLocaleTag('');
    setDraftRegionTag('');
    setDraftVariantTag('');
    setDraftDirection('ltr');
    setDraftExemplarMain('');
    setDraftPrimaryFonts('');
    setDraftFallbackFonts('');
    setDraftBidiIsolate(false);
    setDraftPreferDirAttribute(true);
    setTransformEnabled(false);
    setDraftTransformEngine('table-map');
    setDraftTransformRuleText('');
    setDraftTransformSampleInput('');
    setDraftTransformSampleCasesText('');
    setDraftTransformIsReversible(false);
    setRenderWarningsAcknowledged(false);
    setError('');
    setSubmitting(false);
  }, [languageId]);

  useEffect(() => {
    if (!languageId) {
      if (value) onChange('');
      return;
    }
    if (orthographies.length === 0) {
      if (!isCreating && value) onChange('');
      return;
    }
    if (orthographies.some((orthography) => orthography.id === value)) {
      return;
    }
    onChange(orthographies[0]?.id ?? '');
  }, [isCreating, languageId, onChange, orthographies, value]);

  useEffect(() => {
    if (createMode === 'ipa') {
      const seed = buildIpaSeed(languageId);
      setDraftNameZh(seed.nameZh);
      setDraftNameEn(seed.nameEn);
      setDraftAbbreviation(seed.abbreviation);
      setDraftScriptTag(seed.scriptTag);
      setDraftType(seed.type);
      setDraftLocaleTag(languageId);
      setDraftRegionTag('');
      setDraftVariantTag('');
      setDraftDirection(defaultDirectionForScript(seed.scriptTag));
      setDraftExemplarMain('');
      setDraftPrimaryFonts('');
      setDraftFallbackFonts('');
      setDraftBidiIsolate(false);
      setDraftPreferDirAttribute(true);
      setTransformEnabled(false);
      setDraftTransformEngine('table-map');
      setDraftTransformRuleText('');
      setDraftTransformSampleInput('');
      setDraftTransformSampleCasesText('');
      setDraftTransformIsReversible(false);
      return;
    }

    if (sourceOrthographies.length === 0) {
      setDraftNameZh('');
      setDraftNameEn('');
      setDraftAbbreviation('');
      setDraftScriptTag('');
      setDraftType('practical');
      setDraftLocaleTag('');
      setDraftRegionTag('');
      setDraftVariantTag('');
      setDraftDirection('ltr');
      setDraftExemplarMain('');
      setDraftPrimaryFonts('');
      setDraftFallbackFonts('');
      setDraftBidiIsolate(false);
      setDraftPreferDirAttribute(true);
      setTransformEnabled(false);
      setDraftTransformEngine('table-map');
      setDraftTransformRuleText('');
      setDraftTransformSampleInput('');
      setDraftTransformSampleCasesText('');
      setDraftTransformIsReversible(false);
      return;
    }

    const source = selectedSourceOrthography ?? sourceOrthographies[0];
    const seed = buildSeedFromOrthography(source);
    setDraftNameZh(seed.nameZh);
    setDraftNameEn(seed.nameEn);
    setDraftAbbreviation(seed.abbreviation);
    setDraftScriptTag(seed.scriptTag);
    setDraftType(seed.type);
    setDraftLocaleTag(seed.localeTag);
    setDraftRegionTag(seed.regionTag);
    setDraftVariantTag(seed.variantTag);
    setDraftDirection(seed.direction);
    setDraftExemplarMain(seed.exemplarMain);
    setDraftPrimaryFonts(seed.primaryFonts);
    setDraftFallbackFonts(seed.fallbackFonts);
    setDraftBidiIsolate(seed.bidiIsolate);
    setDraftPreferDirAttribute(seed.preferDirAttribute);
    setTransformEnabled(Boolean(seed.transformRuleText));
    setDraftTransformEngine(seed.transformEngine);
    setDraftTransformRuleText(seed.transformRuleText);
    setDraftTransformSampleInput('');
    setDraftTransformSampleCasesText('');
    setDraftTransformIsReversible(false);
  }, [createMode, languageId, selectedSourceOrthography, sourceOrthographies]);

  useEffect(() => {
    if (!isCreating) {
      return;
    }
    if (createMode === 'ipa') {
      if (sourceOrthographyId) setSourceOrthographyId('');
      return;
    }
    if (sourceOrthographies.length === 0) {
      if (sourceOrthographyId) setSourceOrthographyId('');
      return;
    }
    if (sourceOrthographies.some((orthography) => orthography.id === sourceOrthographyId)) {
      return;
    }
    if (createMode === 'copy-current' && value && sourceOrthographies.some((orthography) => orthography.id === value)) {
      setSourceOrthographyId(value);
      return;
    }
    setSourceOrthographyId(sourceOrthographies[0]?.id ?? '');
  }, [createMode, isCreating, sourceOrthographies, sourceOrthographyId, value]);

  const handleSelectionChange = useCallback((nextValue: string) => {
    if (nextValue === ORTHOGRAPHY_CREATE_SENTINEL) {
      setIsCreating(true);
      setError('');
      return;
    }
    setIsCreating(false);
    setError('');
    onChange(nextValue);
  }, [onChange]);

  const cancelCreate = useCallback(() => {
    setIsCreating(false);
    setError('');
  }, []);

  const acknowledgeRenderWarnings = useCallback(() => {
    setRenderWarningsAcknowledged(true);
    setError('');
  }, []);

  const createOrthography = useCallback(async () => {
    if (!languageId) return undefined;
    const resolvedSourceOrthographyId = sourceOrthographyId || sourceOrthographies[0]?.id || '';
    if ((createMode === 'copy-current' || createMode === 'derive-other') && !resolvedSourceOrthographyId) {
      setError('\u8bf7\u5148\u9009\u62e9\u6765\u6e90\u6b63\u5b57\u6cd5');
      return undefined;
    }
    if (draftRenderWarnings.length > 0 && !renderWarningsAcknowledged) {
      setRenderWarningsAcknowledged(true);
      setError('');
      return undefined;
    }

    setSubmitting(true);
    setError('');
    try {
      const fallbackName = createMode === 'ipa'
        ? `${resolveLanguageLabel(languageId)} IPA`
        : formatOrthographyOptionLabel(selectedSourceOrthography ?? {});
      const name = buildOrthographyNameMap({
        languageId,
        nameZh: draftNameZh,
        nameEn: draftNameEn,
        abbreviation: draftAbbreviation,
        fallback: fallbackName,
      });
      const trimmedAbbreviation = draftAbbreviation.trim();
      const trimmedScriptTag = draftScriptTag.trim();
      const trimmedLocaleTag = draftLocaleTag.trim();
      const trimmedRegionTag = draftRegionTag.trim();
      const trimmedVariantTag = draftVariantTag.trim();
      const exemplarMain = parseDraftList(draftExemplarMain);
      const primaryFonts = parseDraftList(draftPrimaryFonts);
      const fallbackFonts = parseDraftList(draftFallbackFonts);
      const transformRules = canConfigureTransform && transformEnabled
        ? transformDraftRules
        : undefined;
      const sampleCases = canConfigureTransform && transformEnabled
        ? transformDraftSampleCases
        : [];
      const transformSampleCaseFailures = transformSampleCaseResults.filter((sampleCase) => sampleCase.matchesExpectation === false);
      if (transformEnabled && canConfigureTransform && transformValidationIssues.length > 0) {
        setError(transformValidationIssues[0] ?? '\u53d8\u6362\u89c4\u5219\u6821\u9a8c\u5931\u8d25');
        return undefined;
      }
      if (transformEnabled && canConfigureTransform && transformSampleCaseFailures.length > 0) {
        setError(`\u6837\u4f8b\u7528\u4f8b\u6821\u9a8c\u5931\u8d25\uff0c\u5171 ${transformSampleCaseFailures.length} \u6761\u672a\u901a\u8fc7\u3002`);
        return undefined;
      }
      const conversionRules = transformRules
        ? {
          engine: draftTransformEngine,
          rules: transformRules,
        }
        : undefined;
      const orthographyDraft = {
        languageId,
        name,
        ...(trimmedAbbreviation ? { abbreviation: trimmedAbbreviation } : {}),
        ...(trimmedScriptTag ? { scriptTag: trimmedScriptTag } : {}),
        ...(trimmedLocaleTag ? { localeTag: trimmedLocaleTag } : {}),
        ...(trimmedRegionTag ? { regionTag: trimmedRegionTag } : {}),
        ...(trimmedVariantTag ? { variantTag: trimmedVariantTag } : {}),
        direction: draftDirection,
        type: draftType,
        ...(exemplarMain.length ? { exemplarCharacters: { main: exemplarMain } } : {}),
        ...((primaryFonts.length || fallbackFonts.length)
          ? {
            fontPreferences: {
              ...(primaryFonts.length ? { primary: primaryFonts } : {}),
              ...(fallbackFonts.length ? { fallback: fallbackFonts } : {}),
            },
          }
          : {}),
        bidiPolicy: {
          isolateInlineRuns: draftBidiIsolate,
          preferDirAttribute: draftPreferDirAttribute,
        },
        ...(conversionRules ? { conversionRules } : {}),
      };
      const created = createMode === 'ipa'
        ? await LinguisticService.createOrthography(orthographyDraft)
        : await LinguisticService.cloneOrthographyToLanguage({
          sourceOrthographyId: resolvedSourceOrthographyId,
          targetLanguageId: languageId,
          ...orthographyDraft,
        });

      if (transformRules && canConfigureTransform) {
        const sampleInput = draftTransformSampleInput.trim();
        await LinguisticService.createOrthographyTransform({
          sourceOrthographyId: resolvedSourceOrthographyId,
          targetOrthographyId: created.id,
          engine: draftTransformEngine,
          rules: transformRules,
          status: 'active',
          isReversible: draftTransformIsReversible,
          name: {
            zho: `${formatOrthographyOptionLabel(selectedSourceOrthography ?? {})} -> ${name.zho ?? name.eng ?? created.id}`,
            eng: `${formatOrthographyOptionLabel(selectedSourceOrthography ?? {})} -> ${name.eng ?? name.zho ?? created.id}`,
          },
          ...(sampleCases.length ? { sampleCases } : {}),
          ...(sampleInput
            ? {
              sampleInput,
              sampleOutput: previewOrthographyTransform({
                engine: draftTransformEngine,
                rules: transformRules,
                text: sampleInput,
              }),
            }
            : {}),
        });
      }

      setLocalCreatedOrthographies((prev) => mergeOrthographies(prev, [created]));
      onChange(created.id);
      setIsCreating(false);
      return created;
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : '\u6b63\u5b57\u6cd5\u521b\u5efa\u5931\u8d25');
      return undefined;
    } finally {
      setSubmitting(false);
    }
  }, [canConfigureTransform, createMode, draftAbbreviation, draftBidiIsolate, draftDirection, draftExemplarMain, draftFallbackFonts, draftLocaleTag, draftNameEn, draftNameZh, draftPreferDirAttribute, draftPrimaryFonts, draftRegionTag, draftRenderWarnings, draftScriptTag, draftTransformEngine, draftTransformIsReversible, draftTransformSampleCasesText, draftTransformSampleInput, draftType, draftVariantTag, languageId, onChange, renderWarningsAcknowledged, selectedSourceOrthography, sourceOrthographies, sourceOrthographyId, transformDraftRules, transformDraftSampleCases, transformEnabled, transformSampleCaseResults, transformValidationIssues]);

  return {
    orthographies,
    isCreating,
    createMode,
    setCreateMode,
    sourceLanguageId,
    setSourceLanguageId,
    sourceCustomLanguageId,
    setSourceCustomLanguageId,
    sourceOrthographies,
    sourceOrthographyId,
    setSourceOrthographyId,
    draftNameZh,
    setDraftNameZh,
    draftNameEn,
    setDraftNameEn,
    draftAbbreviation,
    setDraftAbbreviation,
    draftScriptTag,
    setDraftScriptTag,
    draftType,
    setDraftType,
    showAdvancedFields,
    setShowAdvancedFields,
    draftLocaleTag,
    setDraftLocaleTag,
    draftRegionTag,
    setDraftRegionTag,
    draftVariantTag,
    setDraftVariantTag,
    draftDirection,
    setDraftDirection,
    draftExemplarMain,
    setDraftExemplarMain,
    draftPrimaryFonts,
    setDraftPrimaryFonts,
    draftFallbackFonts,
    setDraftFallbackFonts,
    draftBidiIsolate,
    setDraftBidiIsolate,
    draftPreferDirAttribute,
    setDraftPreferDirAttribute,
    canConfigureTransform,
    transformEnabled,
    setTransformEnabled,
    draftTransformEngine,
    setDraftTransformEngine,
    draftTransformRuleText,
    setDraftTransformRuleText,
    draftTransformSampleInput,
    setDraftTransformSampleInput,
    draftTransformSampleCasesText,
    setDraftTransformSampleCasesText,
    draftTransformIsReversible,
    setDraftTransformIsReversible,
    draftRenderPolicy,
    draftRenderPreviewText,
    draftRenderWarnings,
    renderWarningsAcknowledged,
    requiresRenderWarningConfirmation,
    transformPreviewOutput,
    transformValidationIssues,
    transformSampleCaseResults,
    error,
    submitting,
    handleSelectionChange,
    cancelCreate,
    acknowledgeRenderWarnings,
    createOrthography,
  };
}

export type UseOrthographyPickerResult = ReturnType<typeof useOrthographyPicker>;
