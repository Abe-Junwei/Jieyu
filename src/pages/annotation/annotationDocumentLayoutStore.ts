import { getDb, patchProjectMetadata } from '../../app/jieyuDbPageAccess';
import { projectTextMetadataKey } from '../../types/projectTextMetadata';
import {
  ANNOTATION_LINE_ORDER,
  EMPTY_ANNOTATION_DOCUMENT_LAYOUT,
  annotationLanguageLineKey,
  type AnnotationDocumentLayout,
  type AnnotationLineId,
} from './annotationIgtLines';
import {
  createAnnotationTextLayer,
  ensureAnnotationLiteralLayer,
} from './ensureAnnotationLiteralLayer';

const METADATA_KEY = projectTextMetadataKey.annotationDocumentLayout;
const LINE_IDS = new Set<string>(ANNOTATION_LINE_ORDER);

function readLineIds(value: unknown): AnnotationLineId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: AnnotationLineId[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !LINE_IDS.has(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item as AnnotationLineId);
  }
  return out;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function readAnnotationDocumentLayout(metadata: unknown): AnnotationDocumentLayout {
  if (metadata === null || metadata === undefined || typeof metadata !== 'object') {
    return EMPTY_ANNOTATION_DOCUMENT_LAYOUT;
  }
  const raw = (metadata as Record<string, unknown>)[METADATA_KEY];
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return EMPTY_ANNOTATION_DOCUMENT_LAYOUT;
  }
  const record = raw as Record<string, unknown>;
  const languageByLine: Record<string, string> = {};
  if (record.languageByLine !== null && typeof record.languageByLine === 'object') {
    for (const [key, value] of Object.entries(record.languageByLine as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const language = value.trim();
      if (key.trim().length === 0 || language.length === 0) continue;
      languageByLine[key] = language;
    }
  }
  const keyOrder = Array.isArray(record.keyOrder) ? readStringList(record.keyOrder) : null;
  const literalLayerId =
    typeof record.literalLayerId === 'string' ? record.literalLayerId.trim() : '';
  const translationLayerId =
    typeof record.translationLayerId === 'string' ? record.translationLayerId.trim() : '';
  return {
    added: readLineIds(record.added),
    hidden: readLineIds(record.hidden),
    languageKeys: readStringList(record.languageKeys).filter((key) => key.includes(':')),
    keyOrder,
    languageByLine,
    literalLayerId,
    translationLayerId,
  };
}

export async function loadAnnotationDocumentLayout(
  textId: string,
): Promise<AnnotationDocumentLayout> {
  const id = textId.trim();
  if (id.length === 0) return EMPTY_ANNOTATION_DOCUMENT_LAYOUT;
  const database = await getDb();
  const existing = await database.collections.texts.findOne({ selector: { id } }).exec();
  if (!existing) return EMPTY_ANNOTATION_DOCUMENT_LAYOUT;
  return readAnnotationDocumentLayout(existing.toJSON().metadata);
}

export async function saveAnnotationDocumentLayout(
  textId: string,
  layout: AnnotationDocumentLayout,
): Promise<void> {
  const id = textId.trim();
  if (id.length === 0) return;
  // 项目不存在时什么也不写 | Nothing to write without a project row
  await patchProjectMetadata(id, (metadata) => ({ ...metadata, [METADATA_KEY]: layout }));
}

export async function saveAnnotationTranslationLayerChoice(
  textId: string,
  translationLayerId: string,
): Promise<void> {
  const current = await loadAnnotationDocumentLayout(textId);
  if (current.translationLayerId === translationLayerId) return;
  await saveAnnotationDocumentLayout(textId, { ...current, translationLayerId });
}

const PENDING_LANGUAGE_LAYER = /^(source|translation):lang:([a-z]{3})$/;

async function bindPendingLanguageLayers(
  textId: string,
  layout: AnnotationDocumentLayout,
): Promise<AnnotationDocumentLayout | null> {
  const languageKeys = [...layout.languageKeys];
  for (let index = 0; index < languageKeys.length; index += 1) {
    const key = languageKeys[index] ?? '';
    const pending = PENDING_LANGUAGE_LAYER.exec(key);
    if (!pending) continue;
    const kind = pending[1] === 'source' ? 'source' : 'translation';
    const layerId = await createAnnotationTextLayer({
      textId,
      layerType: kind === 'source' ? 'transcription' : 'translation',
      languageId: pending[2] ?? '',
    });
    if (layerId === null) return null;
    languageKeys[index] = annotationLanguageLineKey(kind, layerId);
  }
  return { ...layout, languageKeys };
}

/** Persist the document layout. Adding the literal line creates a real translation layer first. */
export async function commitAnnotationDocumentLayout(input: {
  textId: string;
  next: AnnotationDocumentLayout;
  workingLanguageIds: readonly string[];
}): Promise<AnnotationDocumentLayout | null> {
  const bound = await bindPendingLanguageLayers(input.textId, input.next);
  if (bound === null) return null;
  let next = bound;
  if (next.added.includes('literal') && next.literalLayerId.trim().length === 0) {
    const layerId = await ensureAnnotationLiteralLayer({
      textId: input.textId,
      workingLanguageIds: input.workingLanguageIds,
      literalLayerId: '',
    });
    if (layerId === null) return null;
    next = { ...next, literalLayerId: layerId };
  }
  await saveAnnotationDocumentLayout(input.textId, next);
  return next;
}
