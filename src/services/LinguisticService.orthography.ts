import { dexieStoresForOrthographyBridgeUpsertRw, getDb, withTransaction, type MultiLangString, type OrthographyBridgeDocType, type OrthographyDocType } from '../db';
import { getBuiltInOrthographyById, listBuiltInOrthographies, listBuiltInOrthographiesByIds, listAllBuiltInOrthographies } from '../data/builtInOrthographies';
import { getLanguageCatalogEntry as getLanguageCatalogWorkspaceEntry } from './LinguisticService.languageCatalog';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { buildOrthographyIdentityKey, normalizeOrthographyIdentity } from '../utils/orthographyIdentity';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { newId } from '../utils/transcriptionFormatters';
import { previewOrthographyBridge } from '../utils/orthographyBridges';

export interface CreateOrthographyInput {
  languageId: string;
  name: MultiLangString;
  abbreviation?: string;
  type?: OrthographyDocType['type'];
  scriptTag?: string;
  localeTag?: string;
  regionTag?: string;
  variantTag?: string;
  direction?: OrthographyDocType['direction'];
  exemplarCharacters?: OrthographyDocType['exemplarCharacters'];
  normalization?: OrthographyDocType['normalization'];
  collation?: OrthographyDocType['collation'];
  fontPreferences?: OrthographyDocType['fontPreferences'];
  inputHints?: OrthographyDocType['inputHints'];
  bidiPolicy?: OrthographyDocType['bidiPolicy'];
  conversionRules?: Record<string, unknown>;
  notes?: MultiLangString;
}

export interface CloneOrthographyToLanguageInput extends Omit<CreateOrthographyInput, 'languageId' | 'name'> {
  sourceOrthographyId: string;
  targetLanguageId: string;
  name?: MultiLangString;
}

export interface ListOrthographyRecordsSelector {
  languageId?: string;
  languageIds?: readonly string[];
  orthographyIds?: readonly string[];
  searchText?: string;
  searchLanguageIds?: readonly string[];
  includeBuiltIns?: boolean;
}

export interface UpdateOrthographyInput extends Omit<CreateOrthographyInput, 'languageId'> {
  id: string;
  languageId: string;
  catalogMetadata?: Partial<NonNullable<OrthographyDocType['catalogMetadata']>>;
}

export interface CreateOrthographyBridgeInput {
  sourceOrthographyId: string;
  targetOrthographyId: string;
  engine: OrthographyBridgeDocType['engine'];
  rules: OrthographyBridgeDocType['rules'];
  name?: MultiLangString;
  sampleInput?: string;
  sampleOutput?: string;
  sampleCases?: OrthographyBridgeDocType['sampleCases'];
  isReversible?: boolean;
  status?: OrthographyBridgeDocType['status'];
  notes?: MultiLangString;
}

export interface ListOrthographyBridgesSelector {
  sourceOrthographyId?: string;
  targetOrthographyId?: string;
}

export interface UpdateOrthographyBridgeInput {
  id: string;
  sourceOrthographyId?: string;
  targetOrthographyId?: string;
  name?: MultiLangString | null;
  engine?: OrthographyBridgeDocType['engine'];
  rules?: OrthographyBridgeDocType['rules'];
  sampleInput?: string | null;
  sampleOutput?: string | null;
  sampleCases?: OrthographyBridgeDocType['sampleCases'] | null;
  isReversible?: boolean | null;
  status?: OrthographyBridgeDocType['status'] | null;
  notes?: MultiLangString | null;
}

export interface GetActiveOrthographyBridgeInput {
  sourceOrthographyId: string;
  targetOrthographyId: string;
}

export interface ApplyOrthographyBridgeInput {
  text: string;
  sourceOrthographyId?: string;
  targetOrthographyId?: string;
  bridgeId?: string;
}

export interface PreviewOrthographyBridgeInput {
  engine: OrthographyBridgeDocType['engine'];
  rules: OrthographyBridgeDocType['rules'];
  text: string;
}

function resolveOrthographySortLabel(orthography: OrthographyDocType): string {
  return readAnyMultiLangLabel(orthography.name)
    ?? orthography.abbreviation
    ?? orthography.id;
}

function rankOrthographyBridgeStatus(status: OrthographyBridgeDocType['status']): number {
  if (status === 'active') return 0;
  if (status === 'draft' || status === undefined) return 1;
  return 2;
}

async function normalizeRequiredLanguageId(languageId: string): Promise<string> {
  const normalized = languageId.trim().toLowerCase();
  if (!normalized) {
    throw new Error('languageId 不能为空');
  }
  if (isKnownIso639_3Code(normalized)) {
    return normalized;
  }
  if (normalized.startsWith('user:')) {
    const entry = await getLanguageCatalogWorkspaceEntry({
      languageId: normalized,
      locale: 'zh-CN',
    });
    if (entry?.id === normalized) {
      return normalized;
    }
  }
  throw new Error('languageId 必须是已存在的语言资产 ID 或有效的 ISO 639-3 三字母代码');
}

function mergeOrthographyCatalogMetadata(
  existing: OrthographyDocType['catalogMetadata'] | undefined,
  incoming: Partial<NonNullable<OrthographyDocType['catalogMetadata']>> | undefined,
): OrthographyDocType['catalogMetadata'] | undefined {
  if (!existing && !incoming) {
    return undefined;
  }

  return {
    ...(existing?.catalogSource ? { catalogSource: existing.catalogSource } : {}),
    ...(existing?.source ? { source: existing.source } : {}),
    ...(existing?.reviewStatus ? { reviewStatus: existing.reviewStatus } : {}),
    ...(existing?.priority ? { priority: existing.priority } : {}),
    ...(existing?.seedKind ? { seedKind: existing.seedKind } : {}),
    ...(incoming?.catalogSource ? { catalogSource: incoming.catalogSource } : {}),
    ...(incoming?.source ? { source: incoming.source } : {}),
    ...(incoming?.reviewStatus ? { reviewStatus: incoming.reviewStatus } : {}),
    ...(incoming?.priority ? { priority: incoming.priority } : {}),
    ...(incoming?.seedKind ? { seedKind: incoming.seedKind } : {}),
  };
}

function normalizeRequiredOrthographyRef(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('来源与目标正字法不能为空');
  }
  return normalized;
}

async function assertOrthographyExists(
  orthographiesTable: Awaited<ReturnType<typeof getDb>>['dexie']['orthographies'],
  id: string,
  fieldName: 'sourceOrthographyId' | 'targetOrthographyId',
): Promise<void> {
  const orthography = await orthographiesTable.get(id) ?? await getBuiltInOrthographyById(id);
  if (!orthography) {
    throw new Error(fieldName === 'sourceOrthographyId' ? '源正字法不存在' : '目标正字法不存在');
  }
}

function mergeOrthographyCatalogRows(
  builtInRows: OrthographyDocType[],
  dbRows: OrthographyDocType[],
): OrthographyDocType[] {
  const deduped = new Map<string, OrthographyDocType>();
  [...builtInRows, ...dbRows].forEach((orthography) => {
    deduped.set(orthography.id, orthography);
  });
  return Array.from(deduped.values());
}

function buildOrthographySearchText(orthography: OrthographyDocType): string {
  return [
    readAnyMultiLangLabel(orthography.name),
    orthography.abbreviation,
    orthography.id,
    orthography.languageId,
    orthography.scriptTag,
    orthography.type,
  ].filter(Boolean).join(' ').toLowerCase();
}

function normalizeSelectorValues(values: readonly string[] | undefined): string[] | undefined {
  if (!values) {
    return undefined;
  }

  const normalizedValues = Array.from(new Set(
    values
      .map((value) => value.trim())
      .filter(Boolean),
  ));

  return normalizedValues.length > 0 ? normalizedValues : undefined;
}

function normalizeLanguageSelectorValues(values: readonly string[] | undefined): string[] | undefined {
  if (!values) {
    return undefined;
  }

  const normalizedValues = Array.from(new Set(
    values
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ));

  return normalizedValues.length > 0 ? normalizedValues : undefined;
}

async function listScopedBuiltInOrthographies(
  selector: ListOrthographyRecordsSelector,
): Promise<OrthographyDocType[]> {
  if (!selector.includeBuiltIns) {
    return [];
  }

  const normalizedLanguageIds = normalizeLanguageSelectorValues([
    ...(selector.languageId?.trim() ? [selector.languageId.trim()] : []),
    ...(selector.languageIds ?? []),
  ]);
  const normalizedOrthographyIds = normalizeSelectorValues(selector.orthographyIds);
  const scopedLoads: Promise<OrthographyDocType[]>[] = [];

  if (normalizedLanguageIds && normalizedLanguageIds.length > 0) {
    scopedLoads.push(listBuiltInOrthographies(normalizedLanguageIds));
  }
  if (normalizedOrthographyIds && normalizedOrthographyIds.length > 0) {
    scopedLoads.push(listBuiltInOrthographiesByIds(normalizedOrthographyIds));
  }
  if (scopedLoads.length === 0) {
    scopedLoads.push(listAllBuiltInOrthographies());
  }

  const rows = await Promise.all(scopedLoads);
  return rows.flat();
}

async function deactivateSiblingActiveBridges(input: {
  bridgesTable: Awaited<ReturnType<typeof getDb>>['dexie']['orthography_bridges'];
  sourceOrthographyId: string;
  targetOrthographyId: string;
  exceptId?: string;
}): Promise<void> {
  const siblings = await input.bridgesTable
    .where('[sourceOrthographyId+targetOrthographyId]')
    .equals([input.sourceOrthographyId, input.targetOrthographyId])
    .toArray();
  const now = new Date().toISOString();
  await Promise.all(siblings
    .filter((doc) => doc.status === 'active' && doc.id !== input.exceptId)
    .map((doc) => input.bridgesTable.put({
      ...doc,
      status: 'draft',
      updatedAt: now,
    })));
}

async function resolveBridgeForApplication(input: ApplyOrthographyBridgeInput): Promise<OrthographyBridgeDocType | null> {
  const explicitBridgeId = input.bridgeId?.trim();
  if (explicitBridgeId) {
    const db = await getDb();
    const bridge = await db.dexie.orthography_bridges.get(explicitBridgeId);
    if (!bridge) return null;
    const sourceOrthographyId = input.sourceOrthographyId?.trim();
    const targetOrthographyId = input.targetOrthographyId?.trim();
    if (sourceOrthographyId && bridge.sourceOrthographyId !== sourceOrthographyId) return null;
    if (targetOrthographyId && bridge.targetOrthographyId !== targetOrthographyId) return null;
    return bridge;
  }

  const sourceOrthographyId = input.sourceOrthographyId?.trim();
  const targetOrthographyId = input.targetOrthographyId?.trim();
  if (!sourceOrthographyId || !targetOrthographyId) return null;
  return getActiveOrthographyBridgeRecord({
    sourceOrthographyId,
    targetOrthographyId,
  });
}

export async function listOrthographyRecords(
  selector: ListOrthographyRecordsSelector = {},
): Promise<OrthographyDocType[]> {
  const db = await getDb();
  const normalizedLanguageIds = normalizeLanguageSelectorValues([
    ...(selector.languageId?.trim() ? [selector.languageId.trim()] : []),
    ...(selector.languageIds ?? []),
  ]);
  const normalizedOrthographyIds = normalizeSelectorValues(selector.orthographyIds);
  const normalizedSearchText = selector.searchText?.trim().toLowerCase() || '';
  const normalizedSearchLanguageIds = normalizeLanguageSelectorValues(selector.searchLanguageIds);
  const [docs, builtInRows] = await Promise.all([
    db.collections.orthographies.find().exec(),
    listScopedBuiltInOrthographies(selector),
  ]);
  const dbRows = docs.map((doc) => doc.toJSON());
  const rows = selector.includeBuiltIns
    ? mergeOrthographyCatalogRows(builtInRows, dbRows)
    : dbRows;

  return rows
    .filter((orthography) => {
      const normalizedOrthographyLanguageId = orthography.languageId?.trim().toLowerCase() ?? '';
      const matchesExplicitOrthographyId = normalizedOrthographyIds?.includes(orthography.id) ?? false;
      if (matchesExplicitOrthographyId) {
        return true;
      }

      const matchesScopeLanguage = normalizedLanguageIds
        ? normalizedLanguageIds.includes(normalizedOrthographyLanguageId)
        : null;
      const scopeMatches = matchesScopeLanguage === null ? true : matchesScopeLanguage;
      if (!scopeMatches) {
        return false;
      }

      const matchesSearchText = normalizedSearchText
        ? buildOrthographySearchText(orthography).includes(normalizedSearchText)
        : null;
      const matchesSearchLanguage = normalizedSearchLanguageIds
        ? normalizedSearchLanguageIds.includes(normalizedOrthographyLanguageId)
        : null;

      if (matchesSearchText === null && matchesSearchLanguage === null) {
        return true;
      }

      if (matchesSearchText !== null && matchesSearchLanguage !== null) {
        return matchesSearchText || matchesSearchLanguage;
      }

      return Boolean(matchesSearchText ?? matchesSearchLanguage);
    })
    .sort((left, right) => {
      const leftLanguageId = left.languageId ?? '';
      const rightLanguageId = right.languageId ?? '';
      const languageDiff = leftLanguageId.localeCompare(rightLanguageId);
      if (languageDiff !== 0) return languageDiff;

      const labelDiff = resolveOrthographySortLabel(left).localeCompare(resolveOrthographySortLabel(right), 'zh-CN');
      if (labelDiff !== 0) return labelDiff;

      return left.id.localeCompare(right.id);
    });
}

export async function createOrthographyRecord(input: CreateOrthographyInput): Promise<OrthographyDocType> {
  const db = await getDb();
  const now = new Date().toISOString();
  const languageId = await normalizeRequiredLanguageId(input.languageId);
  const normalizedIdentity = normalizeOrthographyIdentity({
    languageId,
    ...(input.type ? { type: input.type } : {}),
    ...(input.scriptTag ? { scriptTag: input.scriptTag } : {}),
    ...(input.localeTag ? { localeTag: input.localeTag } : {}),
    ...(input.regionTag ? { regionTag: input.regionTag } : {}),
    ...(input.variantTag ? { variantTag: input.variantTag } : {}),
  });
  const candidateIdentityKey = buildOrthographyIdentityKey(normalizedIdentity);
  const existingOrthographies = await listOrthographyRecords({
    languageId: normalizedIdentity.languageId ?? languageId,
    includeBuiltIns: true,
  });
  const hasDuplicateIdentity = existingOrthographies
    .some((orthography) => buildOrthographyIdentityKey(orthography) === candidateIdentityKey);
  if (hasDuplicateIdentity) {
    throw new Error('已存在相同语言/类型/脚本/地区/变体身份的正字法');
  }

  const orthography: OrthographyDocType = {
    id: newId('orth'),
    name: input.name,
    languageId: normalizedIdentity.languageId ?? languageId,
    ...(input.abbreviation ? { abbreviation: input.abbreviation } : {}),
    ...(input.type ? { type: input.type } : {}),
    catalogMetadata: {
      catalogSource: 'user',
    },
    ...(normalizedIdentity.scriptTag ? { scriptTag: normalizedIdentity.scriptTag } : {}),
    ...(normalizedIdentity.localeTag ? { localeTag: normalizedIdentity.localeTag } : {}),
    ...(normalizedIdentity.regionTag ? { regionTag: normalizedIdentity.regionTag } : {}),
    ...(normalizedIdentity.variantTag ? { variantTag: normalizedIdentity.variantTag } : {}),
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.exemplarCharacters ? { exemplarCharacters: input.exemplarCharacters } : {}),
    ...(input.normalization ? { normalization: input.normalization } : {}),
    ...(input.collation ? { collation: input.collation } : {}),
    ...(input.fontPreferences ? { fontPreferences: input.fontPreferences } : {}),
    ...(input.inputHints ? { inputHints: input.inputHints } : {}),
    ...(input.bidiPolicy ? { bidiPolicy: input.bidiPolicy } : {}),
    ...(input.conversionRules ? { conversionRules: input.conversionRules } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await db.collections.orthographies.insert(orthography);
  return orthography;
}

export async function updateOrthographyRecord(input: UpdateOrthographyInput): Promise<OrthographyDocType> {
  const db = await getDb();
  const existing = await db.dexie.orthographies.get(input.id) ?? await getBuiltInOrthographyById(input.id);
  if (!existing) {
    throw new Error('正字法不存在');
  }

  const languageId = await normalizeRequiredLanguageId(input.languageId);
  const normalizedIdentity = normalizeOrthographyIdentity({
    languageId,
    ...(input.type ? { type: input.type } : {}),
    ...(input.scriptTag ? { scriptTag: input.scriptTag } : {}),
    ...(input.localeTag ? { localeTag: input.localeTag } : {}),
    ...(input.regionTag ? { regionTag: input.regionTag } : {}),
    ...(input.variantTag ? { variantTag: input.variantTag } : {}),
  });
  const candidateIdentityKey = buildOrthographyIdentityKey(normalizedIdentity);
  const existingIdentityKey = buildOrthographyIdentityKey(existing);
  const preservesExistingIdentity = existing.languageId === (normalizedIdentity.languageId ?? languageId)
    && existingIdentityKey === candidateIdentityKey;
  const existingOrthographies = await listOrthographyRecords({
    languageId: normalizedIdentity.languageId ?? languageId,
    includeBuiltIns: true,
  });
  const hasDuplicateIdentity = existingOrthographies
    .filter((orthography) => orthography.id !== input.id)
    .some((orthography) => buildOrthographyIdentityKey(orthography) === candidateIdentityKey);

  if (hasDuplicateIdentity && !preservesExistingIdentity) {
    throw new Error('已存在相同语言/类型/脚本/地区/变体身份的正字法');
  }

  const nextCatalogMetadata = mergeOrthographyCatalogMetadata(existing.catalogMetadata, input.catalogMetadata);

  const next: OrthographyDocType = {
    id: existing.id,
    name: input.name,
    languageId: normalizedIdentity.languageId ?? languageId,
    ...(input.abbreviation ? { abbreviation: input.abbreviation } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(nextCatalogMetadata ? { catalogMetadata: nextCatalogMetadata } : {}),
    ...(normalizedIdentity.scriptTag ? { scriptTag: normalizedIdentity.scriptTag } : {}),
    ...(normalizedIdentity.localeTag ? { localeTag: normalizedIdentity.localeTag } : {}),
    ...(normalizedIdentity.regionTag ? { regionTag: normalizedIdentity.regionTag } : {}),
    ...(normalizedIdentity.variantTag ? { variantTag: normalizedIdentity.variantTag } : {}),
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.exemplarCharacters ? { exemplarCharacters: input.exemplarCharacters } : {}),
    ...(input.normalization ? { normalization: input.normalization } : {}),
    ...(input.collation ? { collation: input.collation } : {}),
    ...(input.fontPreferences ? { fontPreferences: input.fontPreferences } : {}),
    ...(input.inputHints ? { inputHints: input.inputHints } : {}),
    ...(input.bidiPolicy ? { bidiPolicy: input.bidiPolicy } : {}),
    ...(input.conversionRules ? { conversionRules: input.conversionRules } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await db.collections.orthographies.insert(next);
  return next;
}

export async function cloneOrthographyRecordToLanguage(
  input: CloneOrthographyToLanguageInput,
): Promise<OrthographyDocType> {
  const db = await getDb();
  const source = await db.dexie.orthographies.get(input.sourceOrthographyId)
    ?? await getBuiltInOrthographyById(input.sourceOrthographyId);
  if (!source) {
    throw new Error('\u6e90\u6b63\u5b57\u6cd5\u4e0d\u5b58\u5728');
  }

  return createOrthographyRecord({
    languageId: await normalizeRequiredLanguageId(input.targetLanguageId),
    name: input.name ?? source.name,
    ...((input.abbreviation ?? source.abbreviation) !== undefined
      ? { abbreviation: input.abbreviation ?? source.abbreviation }
      : {}),
    ...((input.type ?? source.type) !== undefined ? { type: input.type ?? source.type } : {}),
    ...((input.scriptTag ?? source.scriptTag) !== undefined
      ? { scriptTag: input.scriptTag ?? source.scriptTag }
      : {}),
    ...((input.localeTag ?? source.localeTag) !== undefined
      ? { localeTag: input.localeTag ?? source.localeTag }
      : {}),
    ...((input.regionTag ?? source.regionTag) !== undefined
      ? { regionTag: input.regionTag ?? source.regionTag }
      : {}),
    ...((input.variantTag ?? source.variantTag) !== undefined
      ? { variantTag: input.variantTag ?? source.variantTag }
      : {}),
    ...((input.direction ?? source.direction) !== undefined
      ? { direction: input.direction ?? source.direction }
      : {}),
    ...((input.exemplarCharacters ?? source.exemplarCharacters) !== undefined
      ? { exemplarCharacters: input.exemplarCharacters ?? source.exemplarCharacters }
      : {}),
    ...((input.normalization ?? source.normalization) !== undefined
      ? { normalization: input.normalization ?? source.normalization }
      : {}),
    ...((input.collation ?? source.collation) !== undefined
      ? { collation: input.collation ?? source.collation }
      : {}),
    ...((input.fontPreferences ?? source.fontPreferences) !== undefined
      ? { fontPreferences: input.fontPreferences ?? source.fontPreferences }
      : {}),
    ...((input.inputHints ?? source.inputHints) !== undefined
      ? { inputHints: input.inputHints ?? source.inputHints }
      : {}),
    ...((input.bidiPolicy ?? source.bidiPolicy) !== undefined
      ? { bidiPolicy: input.bidiPolicy ?? source.bidiPolicy }
      : {}),
    ...((input.conversionRules ?? source.conversionRules) !== undefined
      ? { conversionRules: input.conversionRules ?? source.conversionRules }
      : {}),
    ...((input.notes ?? source.notes) !== undefined ? { notes: input.notes ?? source.notes } : {}),
  });
}

export async function createOrthographyBridgeRecord(
  input: CreateOrthographyBridgeInput,
): Promise<OrthographyBridgeDocType> {
  const db = await getDb();
  const now = new Date().toISOString();
  const sourceOrthographyId = normalizeRequiredOrthographyRef(input.sourceOrthographyId);
  const targetOrthographyId = normalizeRequiredOrthographyRef(input.targetOrthographyId);

  if (sourceOrthographyId === targetOrthographyId) {
    throw new Error('来源与目标正字法不能相同');
  }

  const bridge: OrthographyBridgeDocType = {
    id: newId('orthxfm'),
    sourceOrthographyId,
    targetOrthographyId,
    engine: input.engine,
    rules: input.rules,
    ...(input.name ? { name: input.name } : {}),
    ...(input.sampleInput ? { sampleInput: input.sampleInput } : {}),
    ...(input.sampleOutput ? { sampleOutput: input.sampleOutput } : {}),
    ...(input.sampleCases ? { sampleCases: input.sampleCases } : {}),
    ...(input.isReversible !== undefined ? { isReversible: input.isReversible } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await withTransaction(db, 'rw', [...dexieStoresForOrthographyBridgeUpsertRw(db)], async () => {
    await Promise.all([
      assertOrthographyExists(db.dexie.orthographies, sourceOrthographyId, 'sourceOrthographyId'),
      assertOrthographyExists(db.dexie.orthographies, targetOrthographyId, 'targetOrthographyId'),
    ]);
    if (input.status === 'active') {
      await deactivateSiblingActiveBridges({
        bridgesTable: db.dexie.orthography_bridges,
        sourceOrthographyId,
        targetOrthographyId,
      });
    }
    await db.dexie.orthography_bridges.put(bridge);
  }, { label: 'LinguisticService.orthography.createOrthographyBridgeRecord' });
  return bridge;
}

export async function listOrthographyBridgeRecords(
  selector: ListOrthographyBridgesSelector = {},
): Promise<OrthographyBridgeDocType[]> {
  const db = await getDb();
  const docs = await db.collections.orthography_bridges.find().exec();
  return docs
    .map((doc) => doc.toJSON())
    .filter((doc) => {
      if (selector.sourceOrthographyId && doc.sourceOrthographyId !== selector.sourceOrthographyId) {
        return false;
      }
      if (selector.targetOrthographyId && doc.targetOrthographyId !== selector.targetOrthographyId) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const rankDiff = rankOrthographyBridgeStatus(left.status) - rankOrthographyBridgeStatus(right.status);
      if (rankDiff !== 0) return rankDiff;
      return (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt);
    });
}

export async function updateOrthographyBridgeRecord(
  input: UpdateOrthographyBridgeInput,
): Promise<OrthographyBridgeDocType> {
  const db = await getDb();
  const existing = await db.dexie.orthography_bridges.get(input.id);
  if (!existing) {
    throw new Error('\u6b63\u5b57\u6cd5\u53d8\u6362\u4e0d\u5b58\u5728');
  }

  const next: OrthographyBridgeDocType = {
    ...existing,
    ...(input.sourceOrthographyId ? { sourceOrthographyId: input.sourceOrthographyId.trim() } : {}),
    ...(input.targetOrthographyId ? { targetOrthographyId: input.targetOrthographyId.trim() } : {}),
    ...(input.engine ? { engine: input.engine } : {}),
    ...(input.rules ? { rules: input.rules } : {}),
    updatedAt: new Date().toISOString(),
  };

  next.sourceOrthographyId = normalizeRequiredOrthographyRef(next.sourceOrthographyId);
  next.targetOrthographyId = normalizeRequiredOrthographyRef(next.targetOrthographyId);
  if (next.sourceOrthographyId === next.targetOrthographyId) {
    throw new Error('来源与目标正字法不能相同');
  }

  if (input.name === null) {
    delete next.name;
  } else if (input.name !== undefined) {
    next.name = input.name;
  }

  if (input.sampleInput === null) {
    delete next.sampleInput;
  } else if (input.sampleInput !== undefined) {
    next.sampleInput = input.sampleInput;
  }

  if (input.sampleOutput === null) {
    delete next.sampleOutput;
  } else if (input.sampleOutput !== undefined) {
    next.sampleOutput = input.sampleOutput;
  }

  if (input.sampleCases === null) {
    delete next.sampleCases;
  } else if (input.sampleCases !== undefined) {
    next.sampleCases = input.sampleCases;
  }

  if (input.isReversible === null) {
    delete next.isReversible;
  } else if (input.isReversible !== undefined) {
    next.isReversible = input.isReversible;
  }

  if (input.status === null) {
    delete next.status;
  } else if (input.status !== undefined) {
    next.status = input.status;
  }

  if (input.notes === null) {
    delete next.notes;
  } else if (input.notes !== undefined) {
    next.notes = input.notes;
  }

  if (next.status === 'active') {
    await withTransaction(db, 'rw', [...dexieStoresForOrthographyBridgeUpsertRw(db)], async () => {
      await Promise.all([
        assertOrthographyExists(db.dexie.orthographies, next.sourceOrthographyId, 'sourceOrthographyId'),
        assertOrthographyExists(db.dexie.orthographies, next.targetOrthographyId, 'targetOrthographyId'),
      ]);
      await deactivateSiblingActiveBridges({
        bridgesTable: db.dexie.orthography_bridges,
        sourceOrthographyId: next.sourceOrthographyId,
        targetOrthographyId: next.targetOrthographyId,
        exceptId: next.id,
      });
      await db.dexie.orthography_bridges.put(next);
    }, { label: 'LinguisticService.orthography.updateOrthographyBridgeRecord' });
    return next;
  }

  await Promise.all([
    assertOrthographyExists(db.dexie.orthographies, next.sourceOrthographyId, 'sourceOrthographyId'),
    assertOrthographyExists(db.dexie.orthographies, next.targetOrthographyId, 'targetOrthographyId'),
  ]);
  await db.collections.orthography_bridges.insert(next);
  return next;
}

export async function deleteOrthographyBridgeRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.collections.orthography_bridges.remove(id);
}

export async function getActiveOrthographyBridgeRecord(
  input: GetActiveOrthographyBridgeInput,
): Promise<OrthographyBridgeDocType | null> {
  const db = await getDb();
  const candidates = await db.dexie.orthography_bridges
    .where('[sourceOrthographyId+targetOrthographyId]')
    .equals([input.sourceOrthographyId, input.targetOrthographyId])
    .toArray();

  const preferred = candidates
    .filter((doc) => doc.status === 'active')
    // 已过滤为 active，按最近更新时间取首条 | All active, pick most recently updated
    .sort((left, right) =>
      (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt),
    )[0];

  return preferred ?? null;
}

export async function applyOrthographyBridgeRecord(
  input: ApplyOrthographyBridgeInput,
): Promise<{ text: string; bridgeId?: string }> {
  const sourceOrthographyId = input.sourceOrthographyId?.trim();
  const targetOrthographyId = input.targetOrthographyId?.trim();
  if (!input.text || (sourceOrthographyId && targetOrthographyId && sourceOrthographyId === targetOrthographyId)) {
    return { text: input.text };
  }

  const bridge = await resolveBridgeForApplication(input);
  if (!bridge) {
    return { text: input.text };
  }

  return {
    text: previewOrthographyBridgeText({
      engine: bridge.engine,
      rules: bridge.rules,
      text: input.text,
    }),
    bridgeId: bridge.id,
  };
}

export function previewOrthographyBridgeText(input: PreviewOrthographyBridgeInput): string {
  return previewOrthographyBridge(input);
}
