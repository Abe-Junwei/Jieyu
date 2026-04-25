import { describe, expect, it } from 'vitest';
import type { StructuralRuleProfileAssetDocType } from '../db';
import { DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, type StructuralRuleProfile } from './structuralRuleProfile';
import { resolveStructuralRuleProfile } from './structuralRuleProfileResolver';

const NOW = '2026-04-25T00:00:00.000Z';

function asset(id: string, scope: StructuralRuleProfileAssetDocType['scope'], profile: StructuralRuleProfile, extra: Partial<StructuralRuleProfileAssetDocType> = {}): StructuralRuleProfileAssetDocType {
  return {
    id,
    scope,
    enabled: true,
    priority: 0,
    profile,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

describe('resolveStructuralRuleProfile', () => {
  it('applies language, project, and user precedence over the system default', () => {
    const languageProfile = {
      ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
      id: 'language.zho.structural',
      scope: 'language',
      symbols: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.symbols, morphemeBoundary: '_' },
    } satisfies StructuralRuleProfile;
    const projectProfile = {
      ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
      id: 'project.demo.structural',
      scope: 'project',
      symbols: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.symbols, morphemeBoundary: '~' },
    } satisfies StructuralRuleProfile;
    const userProfile = {
      ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
      id: 'user.session.structural',
      scope: 'user',
      symbols: { ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.symbols, morphemeBoundary: '+' },
    } satisfies StructuralRuleProfile;

    const resolution = resolveStructuralRuleProfile(DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, [
      asset('language-1', 'language', languageProfile, { languageId: 'zho' }),
      asset('project-1', 'project', projectProfile, { projectId: 'project-1' }),
    ], {
      languageId: 'zho',
      projectId: 'project-1',
      userOverrideProfile: userProfile,
    });

    expect(resolution.profile.id).toBe('user.session.structural');
    expect(resolution.profile.symbols.morphemeBoundary).toBe('+');
    expect(resolution.appliedAssetIds).toEqual(['language-1', 'project-1']);
  });

  it('skips disabled and scope-mismatched assets', () => {
    const languageProfile = {
      ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
      id: 'language.zho.structural',
      scope: 'language',
    } satisfies StructuralRuleProfile;
    const resolution = resolveStructuralRuleProfile(DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, [
      asset('disabled', 'language', languageProfile, { languageId: 'zho', enabled: false }),
      asset('mismatch', 'language', languageProfile, { languageId: 'eng' }),
    ], { languageId: 'zho' });

    expect(resolution.profile.id).toBe(DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.id);
    expect(resolution.diagnostics.map((diagnostic) => diagnostic.type)).toEqual([
      'skipped_disabled',
      'skipped_scope_mismatch',
    ]);
  });
});
