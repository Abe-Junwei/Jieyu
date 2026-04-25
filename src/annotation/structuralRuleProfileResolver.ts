import type { StructuralRuleProfileAssetDocType } from '../db';
import {
  DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
  validateStructuralRuleProfile,
  type StructuralRuleProfile,
} from './structuralRuleProfile';

export type StructuralRuleProfileResolutionContext = {
  languageId?: string;
  projectId?: string;
  userOverrideProfile?: StructuralRuleProfile;
};

export type StructuralRuleProfileResolverDiagnostic = {
  type: 'skipped_disabled' | 'skipped_scope_mismatch' | 'invalid_profile' | 'applied_profile';
  assetId?: string;
  scope?: StructuralRuleProfileAssetDocType['scope'];
  message: string;
  severity: 'info' | 'warning';
};

export type StructuralRuleProfileResolution = {
  profile: StructuralRuleProfile;
  appliedAssetIds: string[];
  diagnostics: StructuralRuleProfileResolverDiagnostic[];
};

const SCOPE_RANK: Record<StructuralRuleProfileAssetDocType['scope'], number> = {
  system: 0,
  language: 1,
  project: 2,
  user: 3,
};

function assetMatchesContext(
  asset: StructuralRuleProfileAssetDocType,
  context: StructuralRuleProfileResolutionContext,
): boolean {
  if (asset.scope === 'language') {
    return Boolean(context.languageId) && asset.languageId === context.languageId;
  }
  if (asset.scope === 'project') {
    return Boolean(context.projectId) && asset.projectId === context.projectId;
  }
  return true;
}

function sortAssetsForResolution(
  assets: StructuralRuleProfileAssetDocType[],
): StructuralRuleProfileAssetDocType[] {
  return [...assets].sort((a, b) => {
    const scopeDiff = SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope];
    if (scopeDiff !== 0) return scopeDiff;
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;
    const updatedDiff = a.updatedAt.localeCompare(b.updatedAt);
    if (updatedDiff !== 0) return updatedDiff;
    return a.id.localeCompare(b.id);
  });
}

export function resolveStructuralRuleProfile(
  systemProfile: StructuralRuleProfile = DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
  assets: readonly StructuralRuleProfileAssetDocType[] = [],
  context: StructuralRuleProfileResolutionContext = {},
): StructuralRuleProfileResolution {
  const diagnostics: StructuralRuleProfileResolverDiagnostic[] = [];
  const appliedAssetIds: string[] = [];
  let resolvedProfile = validateStructuralRuleProfile(systemProfile);

  const matchingAssets = sortAssetsForResolution([...assets]);
  for (const asset of matchingAssets) {
    if (!asset.enabled) {
      diagnostics.push({
        type: 'skipped_disabled',
        assetId: asset.id,
        scope: asset.scope,
        message: `Structural rule profile asset "${asset.id}" is disabled.`,
        severity: 'info',
      });
      continue;
    }
    if (!assetMatchesContext(asset, context)) {
      diagnostics.push({
        type: 'skipped_scope_mismatch',
        assetId: asset.id,
        scope: asset.scope,
        message: `Structural rule profile asset "${asset.id}" does not match the current context.`,
        severity: 'info',
      });
      continue;
    }

    try {
      resolvedProfile = validateStructuralRuleProfile(asset.profile);
      appliedAssetIds.push(asset.id);
      diagnostics.push({
        type: 'applied_profile',
        assetId: asset.id,
        scope: asset.scope,
        message: `Applied structural rule profile asset "${asset.id}".`,
        severity: 'info',
      });
    } catch (error) {
      diagnostics.push({
        type: 'invalid_profile',
        assetId: asset.id,
        scope: asset.scope,
        message: error instanceof Error ? error.message : `Invalid structural rule profile asset "${asset.id}".`,
        severity: 'warning',
      });
    }
  }

  if (context.userOverrideProfile) {
    try {
      resolvedProfile = validateStructuralRuleProfile(context.userOverrideProfile);
      diagnostics.push({
        type: 'applied_profile',
        scope: 'user',
        message: 'Applied user session structural rule profile override.',
        severity: 'info',
      });
    } catch (error) {
      diagnostics.push({
        type: 'invalid_profile',
        scope: 'user',
        message: error instanceof Error ? error.message : 'Invalid user session structural rule profile override.',
        severity: 'warning',
      });
    }
  }

  return {
    profile: resolvedProfile,
    appliedAssetIds,
    diagnostics,
  };
}
