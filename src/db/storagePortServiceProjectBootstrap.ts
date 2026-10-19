import { getDb } from './engine';
import { readBackDexieId } from './storagePortReadback';
import { withTransaction } from './withTransaction';
import type { TextDocType } from './types';
import { newId } from '../utils/transcriptionFormatters';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { normalizeProjectLanguageIds } from '../utils/projectLanguageLists';
import { buildPrimaryAndEnglishLabels } from '../utils/multiLangLabels';
import { ensureDefaultAnnotationDocumentInTransaction } from './storagePortServiceAnnotationDocument';

export async function createProject(input: {
  primaryTitle: string;
  englishFallbackTitle: string;
  primaryLanguageId: string;
  objectLanguageIds?: readonly string[];
  workingLanguageIds?: readonly string[];
  primaryOrthographyId?: string;
}): Promise<{ textId: string }> {
  const db = await getDb();
  const now = new Date().toISOString();
  const textId = newId('text');
  const primaryLanguageId = input.primaryLanguageId.trim().toLowerCase();

  if (!isKnownIso639_3Code(primaryLanguageId)) {
    throw new Error('primaryLanguageId 必须是有效的 ISO 639-3 三字母代码');
  }
  const objectLanguageIds = normalizeProjectLanguageIds([
    primaryLanguageId,
    ...(input.objectLanguageIds ?? []),
  ]);
  const workingLanguageIds = normalizeProjectLanguageIds(input.workingLanguageIds ?? []);
  const primaryOrthographyId = input.primaryOrthographyId ?? '';
  let documentId = '';

  await withTransaction(
    db,
    'rw',
    [db.dexie.texts, db.dexie.annotation_documents],
    async () => {
      await db.collections.texts.insert({
        id: textId,
        title: buildPrimaryAndEnglishLabels({
          primaryLabel: input.primaryTitle,
          englishFallbackLabel: input.englishFallbackTitle,
        }),
        metadata: {
          primaryLanguageId: objectLanguageIds[0] ?? primaryLanguageId,
          objectLanguageIds,
          workingLanguageIds,
          timelineMode: 'document',
          logicalDurationSec: 1800,
          timebaseLabel: 'logical-second',
          ...(primaryOrthographyId.length > 0 ? { primaryOrthographyId } : {}),
        },
        createdAt: now,
        updatedAt: now,
      } as TextDocType);
      // 2B-E：每个新项目有一份默认标注文档（UUID）| Every new project gets one default document (UUID)
      documentId = await ensureDefaultAnnotationDocumentInTransaction(db, textId);
    },
    { label: 'projects.create' },
  );

  await readBackDexieId('createProject', textId, () => db.dexie.texts.get(textId));
  await readBackDexieId('createProject', documentId, () =>
    db.dexie.annotation_documents.get(documentId),
  );
  return { textId };
}
