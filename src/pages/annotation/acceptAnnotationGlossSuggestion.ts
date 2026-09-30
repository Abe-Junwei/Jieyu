import { LinguisticService } from '../../app/languageAssetPageAccess';

export async function acceptAnnotationGlossSuggestion(
  tokenId: string,
  gloss: string,
  lang: string,
): Promise<void> {
  const trimmed = gloss.trim();
  if (!trimmed) return;
  await LinguisticService.units.updateTokenGloss(
    tokenId,
    trimmed,
    lang.trim() || 'default',
    'confirmed',
  );
}
