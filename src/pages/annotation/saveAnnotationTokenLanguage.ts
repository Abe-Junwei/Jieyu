import { LinguisticService } from '../../app/languageAssetPageAccess';

export async function saveAnnotationTokenLanguage(
  unitId: string,
  tokenId: string,
  languageId: string,
): Promise<void> {
  const tokens = await LinguisticService.units.listTokensByUnitId(unitId);
  const token = tokens.find((item) => item.id === tokenId);
  if (!token) return;
  const trimmed = languageId.trim();
  const next = { ...token, updatedAt: new Date().toISOString() };
  if (trimmed) next.languageId = trimmed;
  else delete next.languageId;
  await LinguisticService.units.saveToken(next);
}
