import {
  DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
  parseGlossStructure,
  validateStructuralRuleProfile,
  type StructuralParseResult,
  type StructuralRuleProfile,
} from '../annotation/structuralRuleProfile';
import {
  resolveStructuralRuleProfile,
  type StructuralRuleProfileResolution,
  type StructuralRuleProfileResolutionContext,
} from '../annotation/structuralRuleProfileResolver';
import { projectStructuralParseToAnalysisGraph } from '../annotation/analysisGraphProjection';
import type { AnnotationAnalysisGraphFixture } from '../annotation/analysisGraph';
import {
  dexieStoresForStructuralRuleProfilesRw,
  getDb,
  withTransaction,
  type StructuralRuleProfileAssetDocType,
} from '../db';
import { newId } from '../utils/transcriptionFormatters';

export type StructuralRuleProfileAssetSelector = {
  languageId?: string;
  projectId?: string;
  includeDisabled?: boolean;
};

export type CreateStructuralRuleProfileAssetInput = {
  scope: StructuralRuleProfileAssetDocType['scope'];
  languageId?: string;
  projectId?: string;
  enabled?: boolean;
  priority?: number;
  profile: StructuralRuleProfile;
};

export type UpdateStructuralRuleProfileAssetInput = Partial<Omit<CreateStructuralRuleProfileAssetInput, 'scope'>> & {
  id: string;
  scope?: StructuralRuleProfileAssetDocType['scope'];
};

export type PreviewStructuralRuleProfileInput = StructuralRuleProfileResolutionContext & {
  glossText: string;
  text?: string;
};

export type StructuralRuleProfilePreview = {
  resolution: StructuralRuleProfileResolution;
  parseResult: StructuralParseResult;
  candidateGraph: AnnotationAnalysisGraphFixture;
};

function normalizeOptionalRef(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function assertScopedAsset(input: {
  scope: StructuralRuleProfileAssetDocType['scope'];
  languageId?: string;
  projectId?: string;
}): void {
  if (input.scope === 'language' && !input.languageId) {
    throw new Error('language scoped structural profile requires languageId');
  }
  if (input.scope === 'project' && !input.projectId) {
    throw new Error('project scoped structural profile requires projectId');
  }
}

function buildScopeInput(
  scope: StructuralRuleProfileAssetDocType['scope'],
  languageId: string | undefined,
  projectId: string | undefined,
): { scope: StructuralRuleProfileAssetDocType['scope']; languageId?: string; projectId?: string } {
  return {
    scope,
    ...(languageId ? { languageId } : {}),
    ...(projectId ? { projectId } : {}),
  };
}

function sortProfileAssets(rows: StructuralRuleProfileAssetDocType[]): StructuralRuleProfileAssetDocType[] {
  return [...rows].sort((a, b) => {
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;
    const updatedDiff = a.updatedAt.localeCompare(b.updatedAt);
    if (updatedDiff !== 0) return updatedDiff;
    return a.id.localeCompare(b.id);
  });
}

export class LinguisticStructuralProfileService {
  static async listStructuralRuleProfileAssets(
    selector: StructuralRuleProfileAssetSelector = {},
  ): Promise<StructuralRuleProfileAssetDocType[]> {
    const db = await getDb();
    const rows = await db.dexie.structural_rule_profiles.toArray();
    return sortProfileAssets(rows.filter((row) => {
      if (!selector.includeDisabled && !row.enabled) return false;
      const hasLanguageFilter = selector.languageId !== undefined;
      const hasProjectFilter = selector.projectId !== undefined;
      if (row.scope === 'language') return hasLanguageFilter && row.languageId === selector.languageId;
      if (row.scope === 'project') return hasProjectFilter && row.projectId === selector.projectId;
      if (hasLanguageFilter || hasProjectFilter) return false;
      return true;
    }));
  }

  static async createStructuralRuleProfileAsset(
    input: CreateStructuralRuleProfileAssetInput,
  ): Promise<StructuralRuleProfileAssetDocType> {
    const db = await getDb();
    const now = new Date().toISOString();
    const languageId = normalizeOptionalRef(input.languageId);
    const projectId = normalizeOptionalRef(input.projectId);
    assertScopedAsset(buildScopeInput(input.scope, languageId, projectId));
    const doc: StructuralRuleProfileAssetDocType = {
      id: newId('srp'),
      scope: input.scope,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      profile: validateStructuralRuleProfile(input.profile),
      createdAt: now,
      updatedAt: now,
    };
    if (languageId) doc.languageId = languageId;
    if (projectId) doc.projectId = projectId;
    await withTransaction(db, 'rw', dexieStoresForStructuralRuleProfilesRw(db), async () => {
      await db.dexie.structural_rule_profiles.put(doc);
    }, { label: 'LinguisticStructuralProfileService.create' });
    return doc;
  }

  static async updateStructuralRuleProfileAsset(
    input: UpdateStructuralRuleProfileAssetInput,
  ): Promise<StructuralRuleProfileAssetDocType> {
    const db = await getDb();
    const existing = await db.dexie.structural_rule_profiles.get(input.id);
    if (!existing) {
      throw new Error(`structural rule profile asset not found: ${input.id}`);
    }
    const languageId = input.languageId === undefined ? existing.languageId : normalizeOptionalRef(input.languageId);
    const projectId = input.projectId === undefined ? existing.projectId : normalizeOptionalRef(input.projectId);
    const scope = input.scope ?? existing.scope;
    assertScopedAsset(buildScopeInput(scope, languageId, projectId));
    const next: StructuralRuleProfileAssetDocType = {
      ...existing,
      scope,
      enabled: input.enabled ?? existing.enabled,
      priority: input.priority ?? existing.priority,
      profile: input.profile ? validateStructuralRuleProfile(input.profile) : existing.profile,
      updatedAt: new Date().toISOString(),
    };
    if (languageId) {
      next.languageId = languageId;
    } else {
      delete next.languageId;
    }
    if (projectId) {
      next.projectId = projectId;
    } else {
      delete next.projectId;
    }
    await withTransaction(db, 'rw', dexieStoresForStructuralRuleProfilesRw(db), async () => {
      await db.dexie.structural_rule_profiles.put(next);
    }, { label: 'LinguisticStructuralProfileService.update' });
    return next;
  }

  static async setStructuralRuleProfileAssetEnabled(id: string, enabled: boolean): Promise<StructuralRuleProfileAssetDocType> {
    return this.updateStructuralRuleProfileAsset({ id, enabled });
  }

  static async previewStructuralRuleProfile(
    input: PreviewStructuralRuleProfileInput,
  ): Promise<StructuralRuleProfilePreview> {
    const glossText = input.glossText.trim();
    if (!glossText) {
      throw new Error('glossText must be non-empty');
    }
    const selector: StructuralRuleProfileAssetSelector = {
      includeDisabled: true,
      ...(input.languageId ? { languageId: input.languageId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
    };
    const assets = await this.listStructuralRuleProfileAssets(selector);
    const context: StructuralRuleProfileResolutionContext = {
      ...(input.languageId ? { languageId: input.languageId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.userOverrideProfile ? { userOverrideProfile: input.userOverrideProfile } : {}),
    };
    const resolution = resolveStructuralRuleProfile(
      DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
      assets,
      context,
    );
    const parseResult = parseGlossStructure(glossText, resolution.profile);
    const candidateGraph = projectStructuralParseToAnalysisGraph(parseResult, {
      text: input.text ?? glossText,
      displayGloss: glossText,
    });
    return { resolution, parseResult, candidateGraph };
  }
}
