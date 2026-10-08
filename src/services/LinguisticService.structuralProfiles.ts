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
import { isSystemTemplateId } from '../db/catalogOwnership';
import {
  getSystemStructuralRuleProfileTemplate,
  SYSTEM_STRUCTURAL_RULE_PROFILE_TEMPLATES,
  type SystemStructuralRuleProfileTemplate,
} from '../annotation/systemStructuralRuleProfiles';
import {
  activeCatalogProjectId,
  CatalogProjectRequiredError,
  newCatalogUuid,
} from './projectCatalogScope';

export type StructuralRuleProfileAssetSelector = {
  /** 当前项目；为空时只返回代码里的系统模板（D11）| Active project; empty means system templates only */
  projectId?: string;
  languageId?: string;
  includeDisabled?: boolean;
};

/** 列表项 = 代码系统模板（只读）或本项目的行 | List item: read-only system template or project row */
export type StructuralRuleProfileAssetListItem =
  | SystemStructuralRuleProfileTemplate
  | StructuralRuleProfileAssetDocType;

export type CreateStructuralRuleProfileAssetInput = {
  scope: StructuralRuleProfileAssetDocType['scope'];
  projectId: string;
  languageId?: string;
  enabled?: boolean;
  priority?: number;
  profile: StructuralRuleProfile;
};

export type UpdateStructuralRuleProfileAssetInput = {
  id: string;
  scope?: StructuralRuleProfileAssetDocType['scope'];
  languageId?: string;
  enabled?: boolean;
  priority?: number;
  profile?: StructuralRuleProfile;
};

export type CopySystemStructuralRuleProfileInput = {
  systemId: string;
  projectId: string;
  languageId?: string;
};

/** 系统模板只读：要修改先复制到项目 | System templates are read-only; copy to the project first */
export class SystemStructuralTemplateReadOnlyError extends Error {
  constructor(public readonly templateId: string) {
    super(
      `structural rule template "${templateId}" is a read-only system template; copy it to the project before editing`,
    );
    this.name = 'SystemStructuralTemplateReadOnlyError';
  }
}

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
  projectId: string;
}): void {
  if (!input.projectId) {
    throw new CatalogProjectRequiredError();
  }
  if (input.scope === 'language' && !input.languageId) {
    throw new Error('language scoped structural profile requires languageId');
  }
}

function sortProfileAssets(
  rows: StructuralRuleProfileAssetDocType[],
): StructuralRuleProfileAssetDocType[] {
  return [...rows].sort((a, b) => {
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;
    const updatedDiff = a.updatedAt.localeCompare(b.updatedAt);
    if (updatedDiff !== 0) return updatedDiff;
    return a.id.localeCompare(b.id);
  });
}

export class LinguisticStructuralProfileService {
  /** 列表 = 代码系统模板 + 本项目的行；读操作不产生写入 | System templates + project rows; reads never write */
  static async listStructuralRuleProfileAssets(
    selector: StructuralRuleProfileAssetSelector = {},
  ): Promise<StructuralRuleProfileAssetListItem[]> {
    const projectId = normalizeOptionalRef(selector.projectId);
    const system: StructuralRuleProfileAssetListItem[] = [
      ...SYSTEM_STRUCTURAL_RULE_PROFILE_TEMPLATES,
    ];
    if (!projectId) return system;
    const db = await getDb();
    const rows = await db.dexie.structural_rule_profiles
      .where('projectId')
      .equals(projectId)
      .toArray();
    const owned = rows.filter((row) => {
      if (!selector.includeDisabled && !row.enabled) return false;
      if (row.scope === 'language') {
        return selector.languageId !== undefined && row.languageId === selector.languageId;
      }
      return true;
    });
    return [...system, ...sortProfileAssets(owned)];
  }

  /** 解析 ID：先查代码系统模板，再查本项目的行 | Resolve an id: code templates first, then project rows */
  static async getStructuralRuleProfileAsset(
    id: string,
    projectId?: string,
  ): Promise<StructuralRuleProfileAssetListItem | undefined> {
    const system = getSystemStructuralRuleProfileTemplate(id);
    if (system) return system;
    const owner = normalizeOptionalRef(projectId);
    if (!owner) return undefined;
    const db = await getDb();
    const row = await db.dexie.structural_rule_profiles.get(id);
    return row && row.projectId === owner ? row : undefined;
  }

  static async createStructuralRuleProfileAsset(
    input: CreateStructuralRuleProfileAssetInput,
  ): Promise<StructuralRuleProfileAssetDocType> {
    const db = await getDb();
    const now = new Date().toISOString();
    const languageId = normalizeOptionalRef(input.languageId);
    const projectId = normalizeOptionalRef(input.projectId) ?? '';
    assertScopedAsset({ scope: input.scope, projectId, ...(languageId ? { languageId } : {}) });
    const doc: StructuralRuleProfileAssetDocType = {
      id: newCatalogUuid(),
      scope: input.scope,
      projectId,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      profile: validateStructuralRuleProfile(input.profile),
      createdAt: now,
      updatedAt: now,
    };
    if (languageId) doc.languageId = languageId;
    await withTransaction(
      db,
      'rw',
      dexieStoresForStructuralRuleProfilesRw(db),
      async () => {
        await db.dexie.structural_rule_profiles.add(doc);
      },
      { label: 'LinguisticStructuralProfileService.create' },
    );
    return doc;
  }

  /** 复制系统模板到项目：新 UUID，记录来源 | Copy a system template into the project with a new UUID */
  static async copySystemTemplateToProject(
    input: CopySystemStructuralRuleProfileInput,
  ): Promise<StructuralRuleProfileAssetDocType> {
    const template = getSystemStructuralRuleProfileTemplate(input.systemId);
    if (!template) {
      throw new Error(`unknown system structural rule template: ${input.systemId}`);
    }
    const projectId = normalizeOptionalRef(input.projectId) ?? '';
    const languageId = normalizeOptionalRef(input.languageId);
    const scope: StructuralRuleProfileAssetDocType['scope'] = languageId ? 'language' : 'project';
    assertScopedAsset({ scope, projectId, ...(languageId ? { languageId } : {}) });
    const db = await getDb();
    const now = new Date().toISOString();
    const id = newCatalogUuid();
    const doc: StructuralRuleProfileAssetDocType = {
      id,
      scope,
      projectId,
      ...(languageId ? { languageId } : {}),
      derivedFromSystemId: template.id,
      enabled: true,
      priority: template.priority,
      profile: validateStructuralRuleProfile({ ...template.profile, id, scope: 'project' }),
      createdAt: now,
      updatedAt: now,
    };
    await withTransaction(
      db,
      'rw',
      dexieStoresForStructuralRuleProfilesRw(db),
      async () => {
        await db.dexie.structural_rule_profiles.add(doc);
      },
      { label: 'LinguisticStructuralProfileService.copySystemTemplate' },
    );
    return doc;
  }

  static async updateStructuralRuleProfileAsset(
    input: UpdateStructuralRuleProfileAssetInput,
  ): Promise<StructuralRuleProfileAssetDocType> {
    if (isSystemTemplateId(input.id)) {
      throw new SystemStructuralTemplateReadOnlyError(input.id);
    }
    const db = await getDb();
    const existing = await db.dexie.structural_rule_profiles.get(input.id);
    if (!existing) {
      throw new Error(`structural rule profile asset not found: ${input.id}`);
    }
    const languageId =
      input.languageId === undefined ? existing.languageId : normalizeOptionalRef(input.languageId);
    const scope = input.scope ?? existing.scope;
    assertScopedAsset({
      scope,
      projectId: existing.projectId,
      ...(languageId ? { languageId } : {}),
    });
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
    await withTransaction(
      db,
      'rw',
      dexieStoresForStructuralRuleProfilesRw(db),
      async () => {
        await db.dexie.structural_rule_profiles.put(next);
      },
      { label: 'LinguisticStructuralProfileService.update' },
    );
    return next;
  }

  static async setStructuralRuleProfileAssetEnabled(
    id: string,
    enabled: boolean,
  ): Promise<StructuralRuleProfileAssetDocType> {
    return this.updateStructuralRuleProfileAsset({ id, enabled });
  }

  static async previewStructuralRuleProfile(
    input: PreviewStructuralRuleProfileInput,
  ): Promise<StructuralRuleProfilePreview> {
    const glossText = input.glossText.trim();
    if (!glossText) {
      throw new Error('glossText must be non-empty');
    }
    // 未显式给项目时用当前活动项目；只读 | Defaults to the active project; read-only
    const projectId = activeCatalogProjectId(input.projectId);
    const selector: StructuralRuleProfileAssetSelector = {
      includeDisabled: true,
      ...(input.languageId ? { languageId: input.languageId } : {}),
      ...(projectId ? { projectId } : {}),
    };
    const assets = await this.listStructuralRuleProfileAssets(selector);
    const context: StructuralRuleProfileResolutionContext = {
      ...(input.languageId ? { languageId: input.languageId } : {}),
      ...(projectId ? { projectId } : {}),
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
