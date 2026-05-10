import { getDb, type TextDocType } from '../db';
import { newId } from '../utils/transcriptionFormatters';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { buildPrimaryAndEnglishLabels } from '../utils/multiLangLabels';

export async function createProject(input: {
  primaryTitle: string;
  englishFallbackTitle: string;
  primaryLanguageId: string;
  primaryOrthographyId?: string;
}): Promise<{ textId: string }> {
  const db = await getDb();
  const now = new Date().toISOString();
  const textId = newId('text');
  const primaryLanguageId = input.primaryLanguageId.trim().toLowerCase();

  if (!isKnownIso639_3Code(primaryLanguageId)) {
    throw new Error('primaryLanguageId 必须是有效的 ISO 639-3 三字母代码');
  }

  await db.collections.texts.insert({
    id: textId,
    title: buildPrimaryAndEnglishLabels({
      primaryLabel: input.primaryTitle,
      englishFallbackLabel: input.englishFallbackTitle,
    }),
    metadata: {
      primaryLanguageId,
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
