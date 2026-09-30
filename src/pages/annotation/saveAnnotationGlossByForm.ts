import { LinguisticService } from '../../app/languageAssetPageAccess';

export async function saveAnnotationGlossByForm(
  writes: readonly { tokenId: string; gloss: string; glossLang: string }[],
): Promise<number> {
  let saved = 0;
  for (const write of writes) {
    const gloss = write.gloss.trim();
    if (gloss.length === 0) continue;
    await LinguisticService.units.updateTokenGloss(
      write.tokenId,
      gloss,
      write.glossLang.trim() || 'default',
      'confirmed',
    );
    saved += 1;
  }
  return saved;
}
