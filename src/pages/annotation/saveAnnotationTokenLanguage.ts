import { LinguisticService } from '../../app/languageAssetPageAccess';

export async function saveAnnotationTokenLanguage(
  unitId: string,
  tokenId: string,
  languageId: string,
): Promise<void> {
  const tokens = await LinguisticService.units.listTokensByUnitId(unitId);
  if (!tokens.some((item) => item.id === tokenId)) return;
  await LinguisticService.units.updateTokenLanguage(tokenId, languageId);
}
