import { loadStructuralProfileService } from './linguisticServiceLazyLoaders';
import type {
  CreateStructuralRuleProfileAssetInput,
  PreviewStructuralRuleProfileInput,
  StructuralRuleProfileAssetSelector,
  StructuralRuleProfilePreview,
  UpdateStructuralRuleProfileAssetInput,
} from './LinguisticService.structuralProfiles';

export async function listStructuralRuleProfileAssets(
  selector: StructuralRuleProfileAssetSelector = {},
) {
  return (
    await loadStructuralProfileService()
  ).LinguisticStructuralProfileService.listStructuralRuleProfileAssets(selector);
}

export async function createStructuralRuleProfileAsset(
  input: CreateStructuralRuleProfileAssetInput,
) {
  return (
    await loadStructuralProfileService()
  ).LinguisticStructuralProfileService.createStructuralRuleProfileAsset(input);
}

export async function updateStructuralRuleProfileAsset(
  input: UpdateStructuralRuleProfileAssetInput,
) {
  return (
    await loadStructuralProfileService()
  ).LinguisticStructuralProfileService.updateStructuralRuleProfileAsset(input);
}

export async function setStructuralRuleProfileAssetEnabled(id: string, enabled: boolean) {
  return (
    await loadStructuralProfileService()
  ).LinguisticStructuralProfileService.setStructuralRuleProfileAssetEnabled(id, enabled);
}

export async function previewStructuralRuleProfile(
  input: PreviewStructuralRuleProfileInput,
): Promise<StructuralRuleProfilePreview> {
  return (
    await loadStructuralProfileService()
  ).LinguisticStructuralProfileService.previewStructuralRuleProfile(input);
}
