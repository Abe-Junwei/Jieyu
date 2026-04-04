import type { OrthographyDocType } from '../db';
import { TOP50_REVIEWED_LANGUAGE_IDS, TOP50_REVIEWED_ORTHOGRAPHIES } from './orthographyTop50Reviewed';

type GeneratedSeed = {
  id: string;
  labelEn: string;
  scriptCode: string;
  scriptName: string;
  priority: 'primary' | 'secondary';
  source: string;
  seedKind: string;
};

type GeneratedLanguageEntry = {
  iso6393: string;
  languageLabel: string;
  orthographySeeds: GeneratedSeed[];
};

type GeneratedCatalog = {
  languages: GeneratedLanguageEntry[];
};

const GENERATED_CATALOG_URL = '/data/language-support/top500-language-orthography-seeds.json';
const RTL_SCRIPTS = new Set(['Arab', 'Hebr']);

let builtInOrthographyCatalogPromise: Promise<Map<string, OrthographyDocType[]>> | null = null;
let builtInOrthographyIndexPromise: Promise<Map<string, OrthographyDocType>> | null = null;

function dedupeOrthographies(items: OrthographyDocType[]): OrthographyDocType[] {
  const deduped = new Map<string, OrthographyDocType>();
  items.forEach((item) => {
    deduped.set(item.id, item);
  });
  return Array.from(deduped.values());
}

function flattenOrthographyCatalog(catalog: Map<string, OrthographyDocType[]>): OrthographyDocType[] {
  return dedupeOrthographies(Array.from(catalog.values()).flat());
}

function groupOrthographiesByLanguage(items: OrthographyDocType[]): Map<string, OrthographyDocType[]> {
  const grouped = new Map<string, OrthographyDocType[]>();
  items.forEach((item) => {
    const languageId = item.languageId?.trim();
    if (!languageId) return;
    const existing = grouped.get(languageId) ?? [];
    existing.push(item);
    grouped.set(languageId, existing);
  });
  return grouped;
}

function buildGeneratedOrthography(language: GeneratedLanguageEntry, seed: GeneratedSeed): OrthographyDocType {
  const direction: NonNullable<OrthographyDocType['direction']> = RTL_SCRIPTS.has(seed.scriptCode) ? 'rtl' : 'ltr';
  return {
    id: seed.id,
    languageId: language.iso6393,
    name: {
      eng: seed.labelEn,
      zho: `${language.languageLabel} ${seed.scriptName}`,
    },
    type: 'practical',
    catalogMetadata: {
      catalogSource: 'built-in-generated',
      source: seed.source,
      reviewStatus: 'needs-review',
      priority: seed.priority,
      seedKind: seed.seedKind,
    },
    scriptTag: seed.scriptCode,
    direction,
    bidiPolicy: {
      isolateInlineRuns: direction === 'rtl',
      preferDirAttribute: true,
    },
    notes: {
      eng: `Built-in ${seed.seedKind} seed (${seed.source}).`,
      zho: `内置${seed.seedKind === 'script-derived' ? '脚本派生' : seed.seedKind}种子（${seed.source}）。`,
    },
    createdAt: '2026-04-04T00:00:00.000Z',
    updatedAt: '2026-04-04T00:00:00.000Z',
  };
}

async function fetchGeneratedCatalog(): Promise<GeneratedCatalog | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch(GENERATED_CATALOG_URL, { cache: 'force-cache' });
    if (!response.ok) return null;
    return await response.json() as GeneratedCatalog;
  } catch {
    return null;
  }
}

async function loadBuiltInOrthographyCatalog(): Promise<Map<string, OrthographyDocType[]>> {
  const reviewedByLanguage = groupOrthographiesByLanguage(TOP50_REVIEWED_ORTHOGRAPHIES);
  const generatedCatalog = await fetchGeneratedCatalog();
  if (!generatedCatalog) {
    return reviewedByLanguage;
  }

  generatedCatalog.languages.forEach((language) => {
    if (TOP50_REVIEWED_LANGUAGE_IDS.has(language.iso6393)) {
      return;
    }
    const generatedOrthographies = language.orthographySeeds.map((seed) => buildGeneratedOrthography(language, seed));
    const existing = reviewedByLanguage.get(language.iso6393) ?? [];
    reviewedByLanguage.set(language.iso6393, dedupeOrthographies([...existing, ...generatedOrthographies]));
  });

  return reviewedByLanguage;
}

async function loadBuiltInOrthographyIndex(): Promise<Map<string, OrthographyDocType>> {
  if (!builtInOrthographyIndexPromise) {
    builtInOrthographyIndexPromise = loadBuiltInOrthographyCatalog().then((catalog) => {
      const byId = new Map<string, OrthographyDocType>();
      flattenOrthographyCatalog(catalog).forEach((orthography) => {
        byId.set(orthography.id, orthography);
      });
      return byId;
    });
  }
  return builtInOrthographyIndexPromise;
}

export async function listBuiltInOrthographies(languageIds: readonly string[]): Promise<OrthographyDocType[]> {
  const normalizedLanguageIds = Array.from(new Set(languageIds.map((value) => value.trim()).filter(Boolean))).sort();
  if (normalizedLanguageIds.length === 0) return [];
  if (!builtInOrthographyCatalogPromise) {
    builtInOrthographyCatalogPromise = loadBuiltInOrthographyCatalog();
  }
  const catalog = await builtInOrthographyCatalogPromise;
  return dedupeOrthographies(
    normalizedLanguageIds.flatMap((languageId) => catalog.get(languageId) ?? []),
  );
}

export async function listAllBuiltInOrthographies(): Promise<OrthographyDocType[]> {
  if (!builtInOrthographyCatalogPromise) {
    builtInOrthographyCatalogPromise = loadBuiltInOrthographyCatalog();
  }
  return flattenOrthographyCatalog(await builtInOrthographyCatalogPromise);
}

export async function listBuiltInOrthographiesByIds(orthographyIds: readonly string[]): Promise<OrthographyDocType[]> {
  const normalizedIds = Array.from(new Set(orthographyIds.map((value) => value.trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return [];
  const orthographyIndex = await loadBuiltInOrthographyIndex();
  return normalizedIds
    .map((orthographyId) => orthographyIndex.get(orthographyId))
    .filter((orthography): orthography is OrthographyDocType => Boolean(orthography));
}

export async function getBuiltInOrthographyById(orthographyId: string): Promise<OrthographyDocType | null> {
  const normalizedId = orthographyId.trim();
  if (!normalizedId) return null;
  const orthographyIndex = await loadBuiltInOrthographyIndex();
  return orthographyIndex.get(normalizedId) ?? null;
}

export function resetBuiltInOrthographyCatalogForTests(): void {
  builtInOrthographyCatalogPromise = null;
  builtInOrthographyIndexPromise = null;
}