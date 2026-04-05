import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MultiLangString, OrthographyDocType } from '../db';
import { useLocale } from '../i18n';
import { LinguisticService } from '../services/LinguisticService';
import {
  resolveOrthographyRenderPolicy,
  type OrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import {
  buildBridgeRulesFromRuleText,
  evaluateOrthographyBridgeSampleCases,
  parseBridgeSampleCases,
  previewOrthographyBridge,
  validateOrthographyBridge,
} from '../utils/orthographyBridges';
import {
  buildPrimaryAndEnglishLabels,
  readEnglishFallbackMultiLangLabel,
  readLocalizedMultiLangLabel,
  readPrimaryMultiLangLabel,
} from '../utils/multiLangLabels';
import { COMMON_LANGUAGES } from '../utils/transcriptionFormatters';
import { hasSameOrthographyIdentity } from '../utils/orthographyIdentity';
import { useOrthographies } from './useOrthographies';

export const ORTHOGRAPHY_CREATE_SENTINEL = '__create_new_orthography__';

export type OrthographyCreateMode = 'ipa' | 'copy-current' | 'derive-other';

function resolveLanguageLabel(languageId: string): string {
  const matched = COMMON_LANGUAGES.find((item) => item.code === languageId);
  return matched?.label ?? languageId.toUpperCase();
}

function buildOrthographyNameMap(input: {
  languageId: string;
  primaryName: string;
  englishFallbackName: string;
  abbreviation: string;
  fallback?: string;
}): MultiLangString {
  const primaryName = input.primaryName.trim();
  const englishFallbackName = input.englishFallbackName.trim();
  const abbreviation = input.abbreviation.trim();
  const fallback = input.fallback?.trim();
  const name = buildPrimaryAndEnglishLabels({
    primaryLabel: primaryName,
    englishFallbackLabel: englishFallbackName,
  });

  if (!Object.keys(name).length) {
    const languageLabel = resolveLanguageLabel(input.languageId);
    const resolved = fallback || abbreviation || `${languageLabel} \u6b63\u5b57\u6cd5`;
    return buildPrimaryAndEnglishLabels({
      primaryLabel: resolved,
      englishFallbackLabel: fallback || abbreviation || `${input.languageId.toUpperCase()} orthography`,
    });
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
    nameZh: readPrimaryMultiLangLabel(source?.name) ?? '',
    nameEn: readEnglishFallbackMultiLangLabel(source?.name) ?? '',
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
    bridgeEngine: resolveBridgeEngine(source),
    bridgeRuleText: resolveBridgeRuleText(source),
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

function normalizeCustomLanguageId(value: string): string {
  return value.replace(/[^A-Za-z]/g, '').slice(0, 3).toLowerCase();
}

function resolveBridgeEngine(source: OrthographyDocType | undefined): 'table-map' | 'icu-rule' | 'manual' {
  const engine = (source?.conversionRules as { engine?: string } | undefined)?.engine;
  return engine === 'icu-rule' || engine === 'manual' ? engine : 'table-map';
}

function resolveBridgeRuleText(source: OrthographyDocType | undefined): string {
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
}, locale?: 'zh-CN' | 'en-US'): string {
  const name = readLocalizedMultiLangLabel(orthography.name, locale)
    ?? orthography.abbreviation
    ?? '\u672a\u547d\u540d\u6b63\u5b57\u6cd5';
  const extras = [orthography.scriptTag, orthography.type].filter(Boolean).join(' · ');
  return extras ? `${name} · ${extras}` : name;
}

export type OrthographyCatalogGroupKey =
  | 'user'
  | 'reviewed-primary'
  | 'reviewed-secondary'
  | 'historical'
  | 'needs-review'
  | 'experimental'
  | 'legacy'
  | 'other';

export function resolveOrthographyCatalogGroupKey(orthography: Pick<OrthographyDocType, 'catalogMetadata'>): OrthographyCatalogGroupKey {
  const catalogSource = orthography.catalogMetadata?.catalogSource;
  const reviewStatus = orthography.catalogMetadata?.reviewStatus;
  const priority = orthography.catalogMetadata?.priority;

  if (catalogSource === 'user') return 'user';
  if (reviewStatus === 'historical') return 'historical';
  if (reviewStatus === 'experimental') return 'experimental';
  if (reviewStatus === 'legacy') return 'legacy';
  if (reviewStatus === 'verified-primary') return 'reviewed-primary';
  if (reviewStatus === 'verified-secondary') return 'reviewed-secondary';
  if (reviewStatus === 'needs-review') return 'needs-review';
  if (catalogSource === 'built-in-reviewed') {
    return priority === 'secondary' ? 'reviewed-secondary' : 'reviewed-primary';
  }
  if (catalogSource === 'built-in-generated') return 'needs-review';
  return 'other';
}

export function groupOrthographiesForSelect(orthographies: readonly OrthographyDocType[]): Array<{
  key: OrthographyCatalogGroupKey;
  orthographies: OrthographyDocType[];
}> {
  const orderedKeys: OrthographyCatalogGroupKey[] = [
    'user',
    'reviewed-primary',
    'reviewed-secondary',
    'historical',
    'needs-review',
    'experimental',
    'legacy',
    'other',
  ];
  const buckets = new Map<OrthographyCatalogGroupKey, OrthographyDocType[]>();

  orthographies.forEach((orthography) => {
    const groupKey = resolveOrthographyCatalogGroupKey(orthography);
    const group = buckets.get(groupKey);
    if (group) {
      group.push(orthography);
      return;
    }
    buckets.set(groupKey, [orthography]);
  });

  return orderedKeys
    .map((key) => ({ key, orthographies: buckets.get(key) ?? [] }))
    .filter((group) => group.orthographies.length > 0);
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
  const locale = useLocale();
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
  const [bridgeEnabled, setBridgeEnabled] = useState(false);
  const [draftBridgeEngine, setDraftBridgeEngine] = useState<'table-map' | 'icu-rule' | 'manual'>('table-map');
  const [draftBridgeRuleText, setDraftBridgeRuleText] = useState('');
  const [draftBridgeSampleInput, setDraftBridgeSampleInput] = useState('');
  const [draftBridgeSampleCasesText, setDraftBridgeSampleCasesText] = useState('');
  const [draftBridgeIsReversible, setDraftBridgeIsReversible] = useState(false);
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
    return sourceLanguageId === '__custom__'
      ? normalizeCustomLanguageId(sourceCustomLanguageId)
      : sourceLanguageId;
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
  const canConfigureBridge = createMode !== 'ipa' && Boolean(selectedSourceOrthography ?? sourceOrthographies[0]);
  const bridgeDraftRules = useMemo(() => buildBridgeRulesFromRuleText(draftBridgeRuleText, { caseSensitive: true }), [draftBridgeRuleText]);
  const bridgeDraftSampleCases = useMemo(() => parseBridgeSampleCases(draftBridgeSampleCasesText), [draftBridgeSampleCasesText]);
  const bridgeValidationIssues = useMemo(() => {
    if (!bridgeEnabled || !canConfigureBridge) return [];
    return validateOrthographyBridge({
      engine: draftBridgeEngine,
      rules: bridgeDraftRules,
    }).issues;
  }, [canConfigureBridge, draftBridgeEngine, bridgeDraftRules, bridgeEnabled]);
  const bridgeSampleCaseResults = useMemo(() => {
    if (!bridgeEnabled || !canConfigureBridge || bridgeDraftSampleCases.length === 0) return [];
    return evaluateOrthographyBridgeSampleCases({
      engine: draftBridgeEngine,
      rules: bridgeDraftRules,
      sampleCases: bridgeDraftSampleCases,
    });
  }, [canConfigureBridge, draftBridgeEngine, bridgeDraftRules, bridgeDraftSampleCases, bridgeEnabled]);
  const bridgePreviewOutput = useMemo(() => {
    if (!bridgeEnabled) return '';
    const sampleInput = draftBridgeSampleInput.trim();
    if (!sampleInput) return '';
    return previewOrthographyBridge({
      engine: draftBridgeEngine,
      rules: bridgeDraftRules,
      text: sampleInput,
    });
  }, [draftBridgeEngine, draftBridgeSampleInput, bridgeDraftRules, bridgeEnabled]);
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
        primaryName: draftNameZh,
        englishFallbackName: draftNameEn,
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
  const seedFieldsDirtyRef = useRef(false);

  const markSeedFieldsDirty = () => {
    seedFieldsDirtyRef.current = true;
  };

  const resetSeedFieldsDirty = () => {
    seedFieldsDirtyRef.current = false;
  };

  const setCreateModeWithReset = (nextMode: OrthographyCreateMode) => {
    resetSeedFieldsDirty();
    setCreateMode(nextMode);
  };

  const setSourceLanguageIdWithReset = (nextLanguageId: string) => {
    resetSeedFieldsDirty();
    setSourceLanguageId(nextLanguageId);
  };

  const setSourceCustomLanguageIdWithReset = (nextLanguageId: string) => {
    resetSeedFieldsDirty();
    setSourceCustomLanguageId(normalizeCustomLanguageId(nextLanguageId));
  };

  const setSourceOrthographyIdWithReset = (nextOrthographyId: string) => {
    resetSeedFieldsDirty();
    setSourceOrthographyId(nextOrthographyId);
  };

  const setDraftNameZhWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftNameZh(nextValue);
  };

  const setDraftNameEnWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftNameEn(nextValue);
  };

  const setDraftAbbreviationWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftAbbreviation(nextValue);
  };

  const setDraftScriptTagWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftScriptTag(nextValue);
  };

  const setDraftTypeWithDirty = (nextValue: NonNullable<OrthographyDocType['type']>) => {
    markSeedFieldsDirty();
    setDraftType(nextValue);
  };

  const setDraftLocaleTagWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftLocaleTag(nextValue);
  };

  const setDraftRegionTagWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftRegionTag(nextValue);
  };

  const setDraftVariantTagWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftVariantTag(nextValue);
  };

  const setDraftDirectionWithDirty = (nextValue: NonNullable<OrthographyDocType['direction']>) => {
    markSeedFieldsDirty();
    setDraftDirection(nextValue);
  };

  const setDraftExemplarMainWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftExemplarMain(nextValue);
  };

  const setDraftPrimaryFontsWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftPrimaryFonts(nextValue);
  };

  const setDraftFallbackFontsWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftFallbackFonts(nextValue);
  };

  const setDraftBidiIsolateWithDirty = (nextValue: boolean) => {
    markSeedFieldsDirty();
    setDraftBidiIsolate(nextValue);
  };

  const setDraftPreferDirAttributeWithDirty = (nextValue: boolean) => {
    markSeedFieldsDirty();
    setDraftPreferDirAttribute(nextValue);
  };

  const setBridgeEnabledWithDirty = (nextValue: boolean) => {
    markSeedFieldsDirty();
    setBridgeEnabled(nextValue);
  };

  const setDraftBridgeEngineWithDirty = (nextValue: 'table-map' | 'icu-rule' | 'manual') => {
    markSeedFieldsDirty();
    setDraftBridgeEngine(nextValue);
  };

  const setDraftBridgeRuleTextWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftBridgeRuleText(nextValue);
  };

  const setDraftBridgeSampleInputWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftBridgeSampleInput(nextValue);
  };

  const setDraftBridgeSampleCasesTextWithDirty = (nextValue: string) => {
    markSeedFieldsDirty();
    setDraftBridgeSampleCasesText(nextValue);
  };

  const setDraftBridgeIsReversibleWithDirty = (nextValue: boolean) => {
    markSeedFieldsDirty();
    setDraftBridgeIsReversible(nextValue);
  };

  useEffect(() => {
    setRenderWarningsAcknowledged(false);
  }, [draftRenderWarnings.join('\u0000')]);

  useEffect(() => {
    setLocalCreatedOrthographies([]);
    seedFieldsDirtyRef.current = false;
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
    setBridgeEnabled(false);
    setDraftBridgeEngine('table-map');
    setDraftBridgeRuleText('');
    setDraftBridgeSampleInput('');
    setDraftBridgeSampleCasesText('');
    setDraftBridgeIsReversible(false);
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
    if (seedFieldsDirtyRef.current) {
      return;
    }
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
      setBridgeEnabled(false);
      setDraftBridgeEngine('table-map');
      setDraftBridgeRuleText('');
      setDraftBridgeSampleInput('');
      setDraftBridgeSampleCasesText('');
      setDraftBridgeIsReversible(false);
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
      setBridgeEnabled(false);
      setDraftBridgeEngine('table-map');
      setDraftBridgeRuleText('');
      setDraftBridgeSampleInput('');
      setDraftBridgeSampleCasesText('');
      setDraftBridgeIsReversible(false);
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
    setBridgeEnabled(Boolean(seed.bridgeRuleText));
    setDraftBridgeEngine(seed.bridgeEngine);
    setDraftBridgeRuleText(seed.bridgeRuleText);
    setDraftBridgeSampleInput('');
    setDraftBridgeSampleCasesText('');
    setDraftBridgeIsReversible(false);
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
    let createdOrthography: OrthographyDocType | undefined;
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
        : formatOrthographyOptionLabel(selectedSourceOrthography ?? {}, locale);
      const name = buildOrthographyNameMap({
        languageId,
        primaryName: draftNameZh,
        englishFallbackName: draftNameEn,
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
      const bridgeRules = canConfigureBridge && bridgeEnabled
        ? bridgeDraftRules
        : undefined;
      const sampleCases = canConfigureBridge && bridgeEnabled
        ? bridgeDraftSampleCases
        : [];
      const bridgeSampleCaseFailures = bridgeSampleCaseResults.filter((sampleCase) => sampleCase.matchesExpectation === false);
      if (bridgeEnabled && canConfigureBridge && bridgeValidationIssues.length > 0) {
        setError(bridgeValidationIssues[0] ?? '\u53d8\u6362\u89c4\u5219\u6821\u9a8c\u5931\u8d25');
        return undefined;
      }
      if (bridgeEnabled && canConfigureBridge && bridgeSampleCaseFailures.length > 0) {
        setError(`\u6837\u4f8b\u7528\u4f8b\u6821\u9a8c\u5931\u8d25\uff0c\u5171 ${bridgeSampleCaseFailures.length} \u6761\u672a\u901a\u8fc7\u3002`);
        return undefined;
      }
      const conversionRules = bridgeRules
        ? {
          engine: draftBridgeEngine,
          rules: bridgeRules,
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
      const conflictingOrthography = orthographies.find((orthography) => {
        try {
          return hasSameOrthographyIdentity(
            {
              languageId,
              ...(orthographyDraft.type ? { type: orthographyDraft.type } : {}),
              ...(orthographyDraft.scriptTag ? { scriptTag: orthographyDraft.scriptTag } : {}),
              ...(orthographyDraft.localeTag ? { localeTag: orthographyDraft.localeTag } : {}),
              ...(orthographyDraft.regionTag ? { regionTag: orthographyDraft.regionTag } : {}),
              ...(orthographyDraft.variantTag ? { variantTag: orthographyDraft.variantTag } : {}),
            },
            {
              ...(orthography.languageId ? { languageId: orthography.languageId } : {}),
              ...(orthography.type ? { type: orthography.type } : {}),
              ...(orthography.scriptTag ? { scriptTag: orthography.scriptTag } : {}),
              ...(orthography.localeTag ? { localeTag: orthography.localeTag } : {}),
              ...(orthography.regionTag ? { regionTag: orthography.regionTag } : {}),
              ...(orthography.variantTag ? { variantTag: orthography.variantTag } : {}),
            },
          );
        } catch (e) {
          console.warn('Orthography identity match failed', e);
          return false;
        }
      });
      if (conflictingOrthography) {
        setError(`已存在相同身份的正字法：${formatOrthographyOptionLabel(conflictingOrthography, locale)}`);
        return undefined;
      }

      const created = createMode === 'ipa'
        ? await LinguisticService.createOrthography(orthographyDraft)
        : await LinguisticService.cloneOrthographyToLanguage({
          sourceOrthographyId: resolvedSourceOrthographyId,
          targetLanguageId: languageId,
          ...orthographyDraft,
        });
      createdOrthography = created;

      if (bridgeRules && canConfigureBridge) {
        try {
          const sampleInput = draftBridgeSampleInput.trim();
          await LinguisticService.createOrthographyBridge({
            sourceOrthographyId: resolvedSourceOrthographyId,
            targetOrthographyId: created.id,
            engine: draftBridgeEngine,
            rules: bridgeRules,
            status: 'active',
            isReversible: draftBridgeIsReversible,
            name: buildPrimaryAndEnglishLabels({
              primaryLabel: `${formatOrthographyOptionLabel(selectedSourceOrthography ?? {}, locale)} -> ${readPrimaryMultiLangLabel(name) ?? created.id}`,
              englishFallbackLabel: `${formatOrthographyOptionLabel(selectedSourceOrthography ?? {}, locale)} -> ${readEnglishFallbackMultiLangLabel(name) ?? readPrimaryMultiLangLabel(name) ?? created.id}`,
            }),
            ...(sampleCases.length ? { sampleCases } : {}),
            ...(sampleInput
              ? {
                sampleInput,
                sampleOutput: previewOrthographyBridge({
                  engine: draftBridgeEngine,
                  rules: bridgeRules,
                  text: sampleInput,
                }),
              }
              : {}),
          });
        } catch (bridgeError) {
          setLocalCreatedOrthographies((prev) => mergeOrthographies(prev, [created]));
          onChange(created.id);
          setIsCreating(false);
          setError(`Orthography created, but bridge creation failed: ${bridgeError instanceof Error ? bridgeError.message : String(bridgeError)}`);
          return created;
        }
      }

      setLocalCreatedOrthographies((prev) => mergeOrthographies(prev, [created]));
      onChange(created.id);
      setIsCreating(false);
      return created;
    } catch (creationError) {
      if (createdOrthography) {
        const created = createdOrthography;
        setLocalCreatedOrthographies((prev) => mergeOrthographies(prev, [created]));
        onChange(created.id);
        setIsCreating(false);
        setError(`Orthography created, but follow-up configuration failed: ${creationError instanceof Error ? creationError.message : String(creationError)}`);
        return created;
      }
      setError(creationError instanceof Error ? creationError.message : '\u6b63\u5b57\u6cd5\u521b\u5efa\u5931\u8d25');
      return undefined;
    } finally {
      setSubmitting(false);
    }
  }, [bridgeDraftRules, bridgeDraftSampleCases, bridgeEnabled, bridgeSampleCaseResults, bridgeValidationIssues, canConfigureBridge, createMode, draftAbbreviation, draftBidiIsolate, draftBridgeEngine, draftBridgeIsReversible, draftBridgeSampleCasesText, draftBridgeSampleInput, draftDirection, draftExemplarMain, draftFallbackFonts, draftLocaleTag, draftNameEn, draftNameZh, draftPreferDirAttribute, draftPrimaryFonts, draftRegionTag, draftRenderWarnings, draftScriptTag, draftType, draftVariantTag, languageId, locale, onChange, orthographies, renderWarningsAcknowledged, selectedSourceOrthography, sourceOrthographies, sourceOrthographyId]);

  return {
    orthographies,
    isCreating,
    createMode,
    setCreateMode: setCreateModeWithReset,
    sourceLanguageId,
    setSourceLanguageId: setSourceLanguageIdWithReset,
    sourceCustomLanguageId,
    setSourceCustomLanguageId: setSourceCustomLanguageIdWithReset,
    sourceOrthographies,
    sourceOrthographyId,
    setSourceOrthographyId: setSourceOrthographyIdWithReset,
    draftNameZh,
    setDraftNameZh: setDraftNameZhWithDirty,
    draftNameEn,
    setDraftNameEn: setDraftNameEnWithDirty,
    draftAbbreviation,
    setDraftAbbreviation: setDraftAbbreviationWithDirty,
    draftScriptTag,
    setDraftScriptTag: setDraftScriptTagWithDirty,
    draftType,
    setDraftType: setDraftTypeWithDirty,
    showAdvancedFields,
    setShowAdvancedFields,
    draftLocaleTag,
    setDraftLocaleTag: setDraftLocaleTagWithDirty,
    draftRegionTag,
    setDraftRegionTag: setDraftRegionTagWithDirty,
    draftVariantTag,
    setDraftVariantTag: setDraftVariantTagWithDirty,
    draftDirection,
    setDraftDirection: setDraftDirectionWithDirty,
    draftExemplarMain,
    setDraftExemplarMain: setDraftExemplarMainWithDirty,
    draftPrimaryFonts,
    setDraftPrimaryFonts: setDraftPrimaryFontsWithDirty,
    draftFallbackFonts,
    setDraftFallbackFonts: setDraftFallbackFontsWithDirty,
    draftBidiIsolate,
    setDraftBidiIsolate: setDraftBidiIsolateWithDirty,
    draftPreferDirAttribute,
    setDraftPreferDirAttribute: setDraftPreferDirAttributeWithDirty,
    canConfigureBridge,
    bridgeEnabled,
    setBridgeEnabled: setBridgeEnabledWithDirty,
    draftBridgeEngine,
    setDraftBridgeEngine: setDraftBridgeEngineWithDirty,
    draftBridgeRuleText,
    setDraftBridgeRuleText: setDraftBridgeRuleTextWithDirty,
    draftBridgeSampleInput,
    setDraftBridgeSampleInput: setDraftBridgeSampleInputWithDirty,
    draftBridgeSampleCasesText,
    setDraftBridgeSampleCasesText: setDraftBridgeSampleCasesTextWithDirty,
    draftBridgeIsReversible,
    setDraftBridgeIsReversible: setDraftBridgeIsReversibleWithDirty,
    draftRenderPolicy,
    draftRenderPreviewText,
    draftRenderWarnings,
    renderWarningsAcknowledged,
    requiresRenderWarningConfirmation,
    bridgePreviewOutput,
    bridgeValidationIssues,
    bridgeSampleCaseResults,
    error,
    submitting,
    handleSelectionChange,
    cancelCreate,
    acknowledgeRenderWarnings,
    createOrthography,
  };
}

export type UseOrthographyPickerResult = ReturnType<typeof useOrthographyPicker>;
