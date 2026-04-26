import { listLanguageCatalogEntries, type LanguageCatalogEntry } from '../services/LinguisticService.languageCatalog';
import { LinguisticStructuralProfileService, type StructuralRuleProfilePreview } from '../services/LinguisticService.structuralProfiles';

export type { LanguageCatalogEntry, StructuralRuleProfilePreview };

export async function loadStructuralProfileWorkspaceEntries(input: {
  locale: 'zh-CN' | 'en-US';
  includeHidden?: boolean;
  languageIds?: readonly string[];
}): Promise<LanguageCatalogEntry[]> {
  return listLanguageCatalogEntries(input);
}

export async function previewStructuralProfileWorkspaceRule(input: {
  languageId: string;
  glossText: string;
}): Promise<StructuralRuleProfilePreview> {
  return LinguisticStructuralProfileService.previewStructuralRuleProfile(input);
}
