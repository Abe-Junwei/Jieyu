import { getDb, type TextDocType } from '../db';
import { newId } from '../utils/transcriptionFormatters';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { normalizeProjectLanguageIds } from '../utils/projectLanguageLists';
import { buildPrimaryAndEnglishLabels } from '../utils/multiLangLabels';

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
      ...(input.primaryOrthographyId ? { primaryOrthographyId: input.primaryOrthographyId } : {}),
    },
    createdAt: now,
    updatedAt: now,
  } as TextDocType);

  return { textId };
}
