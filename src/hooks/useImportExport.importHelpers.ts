import type { JieyuDatabase, SpeakerDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { newId, parseBcp47 } from '../utils/transcriptionFormatters';

const EAF_META_TIER_FIELD = 'tier' + 'Id';

export function withEafKeyMeta(baseKey: string, meta?: { externalTierId?: string; langLabel?: string }): string {
  if (!meta) return baseKey;
  const externalTierId = meta.externalTierId?.trim();
  const langLabel = meta.langLabel?.trim();
  if (!externalTierId && !langLabel) return baseKey;
  const payload = JSON.stringify({
    ...(externalTierId ? { [EAF_META_TIER_FIELD]: externalTierId } : {}),
    ...(langLabel ? { langLabel } : {}),
  });
  return `${baseKey}__eafmeta_${encodeURIComponent(payload)}`;
}

export type ImportLayerNameSource = 'db' | 'eaf' | 'fallback';

export function createImportLanguageResolvers(input: {
  languageNameByIso: Map<string, string>;
  eafLanguageLabels?: ReadonlyMap<string, string>;
}) {
  const { languageNameByIso, eafLanguageLabels } = input;

  const resolveDbLanguageName = (languageTagOrId?: string): string | undefined => {
    if (!languageTagOrId) return undefined;
    const raw = languageTagOrId.trim();
    if (!raw) return undefined;
    const primary = parseBcp47(raw).primary;
    return languageNameByIso.get(raw.toLocaleLowerCase('en'))
      ?? (primary ? languageNameByIso.get(primary.toLocaleLowerCase('en')) : undefined);
  };

  const resolveEafLanguageLabel = (languageTagOrId?: string): string | undefined => {
    if (!eafLanguageLabels || !languageTagOrId) return undefined;
    const raw = languageTagOrId.trim();
    if (!raw) return undefined;
    const primary = parseBcp47(raw).primary;
    return eafLanguageLabels.get(raw)
      ?? (primary ? eafLanguageLabels.get(primary) : undefined);
  };

  const resolveLayerDisplayName = (
    languageTagCandidates: Array<string | undefined>,
    fallbackName: string,
  ): { label: string; source: ImportLayerNameSource; matchedTag?: string } => {
    for (const candidate of languageTagCandidates) {
      const fromDb = resolveDbLanguageName(candidate);
      if (fromDb) {
        return { label: fromDb, source: 'db', ...(candidate ? { matchedTag: candidate } : {}) };
      }
    }
    for (const candidate of languageTagCandidates) {
      const fromEaf = resolveEafLanguageLabel(candidate);
      if (fromEaf) {
        return { label: fromEaf, source: 'eaf', ...(candidate ? { matchedTag: candidate } : {}) };
      }
    }
    return { label: fallbackName, source: 'fallback' };
  };

  return {
    resolveDbLanguageName,
    resolveEafLanguageLabel,
    resolveLayerDisplayName,
  };
}

export async function buildImportLanguageNameMap(db: JieyuDatabase): Promise<Map<string, string>> {
  const languageDocs = await db.collections.languages.find().exec();
  const languageNameByIso = new Map<string, string>();
  for (const doc of languageDocs) {
    const language = doc.toJSON();
    const fromName = typeof language.name === 'object' && language.name !== null
      ? (readAnyMultiLangLabel(language.name) ?? '')
      : '';
    const displayName = (fromName || language.autonym || '').trim();
    if (!displayName) continue;
    languageNameByIso.set(language.id.toLocaleLowerCase('en'), displayName);
  }
  return languageNameByIso;
}

export async function writeImportLayerNameAudit(input: {
  db: JieyuDatabase;
  now: string;
  layerId: string;
  displayName: string;
  source: ImportLayerNameSource;
  languageId?: string;
  tierName?: string;
  matchedTag?: string;
}): Promise<void> {
  try {
    await input.db.collections.audit_logs.insert({
      id: newId('audit'),
      collection: 'tier_definitions',
      documentId: input.layerId,
      action: 'create',
      field: 'name',
      ...(input.displayName ? { newValue: input.displayName } : {}),
      source: 'system',
      timestamp: input.now,
      metadataJson: JSON.stringify({
        mode: 'import-language-name-resolution',
        nameSource: input.source,
        ...(input.languageId ? { languageId: input.languageId } : {}),
        ...(input.tierName ? { tierName: input.tierName } : {}),
        ...(input.matchedTag ? { matchedTag: input.matchedTag } : {}),
      }),
    });
  } catch (auditErr) {
    console.warn('[Import] Failed to write language-name audit log', auditErr);
  }
}

/** Effective host for a trl layer during import from `layer_links` only. */
export async function resolvePreferredHostTranscriptionLayerIdForTranslationImport(
  db: JieyuDatabase,
  translationLayerId: string,
): Promise<string | undefined> {
  const links = await db.dexie.layer_links.where('layerId').equals(translationLayerId).toArray();
  const preferred = links.find((l) => l.isPreferred);
  if (preferred) return preferred.hostTranscriptionLayerId;
  if (links.length > 0) return links[0]?.hostTranscriptionLayerId;
  return undefined;
}

export async function createImportSpeakerResolver(input: {
  normalizeSpeakerLookupKey: (value: string | undefined) => string;
}) {
  const speakerIdMap = new Map<string, string>();
  const existingSpeakers = await LinguisticService.getSpeakers();
  const speakerByName = new Map(
    existingSpeakers.map((speaker) => [input.normalizeSpeakerLookupKey(speaker.name), speaker] as const),
  );

  const rememberSpeaker = (rawKey: string, normalized: string, speaker: Pick<SpeakerDocType, 'id'>) => {
    const normalizedRawKey = input.normalizeSpeakerLookupKey(rawKey);
    if (normalizedRawKey) speakerIdMap.set(normalizedRawKey, speaker.id);
    if (normalized) speakerIdMap.set(normalized, speaker.id);
  };

  const resolveOrCreateSpeaker = async (rawKey: string, displayName: string): Promise<string> => {
    const normalized = input.normalizeSpeakerLookupKey(displayName);
    const existing = speakerByName.get(normalized);
    if (existing) {
      rememberSpeaker(rawKey, normalized, existing);
      return existing.id;
    }
    const speaker = await LinguisticService.createSpeaker({ name: displayName.trim() });
    speakerByName.set(normalized, speaker);
    rememberSpeaker(rawKey, normalized, speaker);
    return speaker.id;
  };

  return {
    speakerIdMap,
    resolveOrCreateSpeaker,
  };
}
