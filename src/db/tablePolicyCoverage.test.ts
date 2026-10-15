/**
 * 每张主表在四条策略里各有一个立场。策略彼此独立，不从分类派生。
 * 新增主表时这里会编译失败，直到补上立场，并且和现有名单一致。
 * Each main table states a stance in four policies. The policies stay independent.
 * A new main table fails this file until its stance is written and matches the live lists.
 */
import { describe, expect, it } from 'vitest';
import { RECOVERY_EXPORT_COLLECTIONS } from './io';
import {
  COLLAB_PROJECT_SNAPSHOT_EXCLUDED_COLLECTIONS,
  filterCollectionsForProject,
} from './projectScopedSnapshot';
import { projectPurgeTableNames, PROJECT_PURGE_UNATTRIBUTABLE_TABLES } from './projectLocalPurge';
import {
  isCollectionDroppedOnImport,
  JIEYU_DATA_CLASS_IN_JYB,
  JIEYU_MAIN_TABLE_REGISTRY,
  type JieyuDataClass,
  type JieyuMainTableName,
} from './tableRegistry';

type TablePolicyStance = {
  recovery: 'include' | 'exclude';
  collab: 'include' | 'exclude' | 'not-copied';
  deleteProject: 'include' | 'exclude';
  replaceContent: 'purge' | 'keep';
};

const TABLE_POLICY_STANCES = {
  abbreviations: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  agent_artifacts: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'exclude',
    replaceContent: 'keep',
  },
  ai_conversations: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  ai_messages: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  ai_runtime_v2_turns: {
    recovery: 'exclude',
    collab: 'not-copied',
    deleteProject: 'exclude',
    replaceContent: 'keep',
  },
  ai_session_memories: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  ai_source_sets: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  ai_task_snapshots: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  ai_tasks: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  anchors: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  annotation_documents: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  audit_logs: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  bibliographic_sources: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  custom_field_definitions: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  embeddings: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  external_mcp_trust: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'exclude',
    replaceContent: 'keep',
  },
  grammar_docs: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  language_aliases: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  language_asset_overviews: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  language_catalog_history: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  language_display_names: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  languages: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  layer_links: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  layer_unit_contents: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  layer_units: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  lexeme_asset_links: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  lexeme_assets: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  lexemes: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  locations: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  mcp_tool_call_audits: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'exclude',
    replaceContent: 'keep',
  },
  media_items: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  orthographies: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  orthography_bridges: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  phonemes: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  project_ai_memories: {
    recovery: 'exclude',
    collab: 'exclude',
    deleteProject: 'include',
    replaceContent: 'keep',
  },
  scope_stats_snapshots: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  segment_meta: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  segment_quality_snapshots: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  source_records: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  speaker_profile_snapshots: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  speakers: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  structural_rule_profiles: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  tag_definitions: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  texts: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  tier_annotations: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  tier_definitions: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  token_lexeme_links: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  track_entities: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  translation_status_snapshots: {
    recovery: 'exclude',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  unit_morphemes: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  unit_relations: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  unit_tokens: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
  user_notes: {
    recovery: 'include',
    collab: 'include',
    deleteProject: 'include',
    replaceContent: 'purge',
  },
} as const satisfies Record<JieyuMainTableName, TablePolicyStance>;

/** 非 JYB 导入按类丢弃或保留。JYB 另有一张表，项目 AI 只在那边进入包。 */
const NON_JYB_IMPORT_STANCE = {
  project_content: 'keep',
  project_catalog: 'keep',
  project_ai: 'drop',
  derived: 'keep',
  audit_log: 'drop',
  credential: 'drop',
  user_preference: 'keep',
  collab_state: 'keep',
  recovery: 'keep',
  private_log: 'keep',
} as const satisfies Record<JieyuDataClass, 'keep' | 'drop'>;

const JYB_PACKAGE_STANCE = {
  project_content: 'include',
  project_catalog: 'include',
  project_ai: 'include',
  user_preference: 'include',
  derived: 'exclude',
  audit_log: 'exclude',
  credential: 'exclude',
  collab_state: 'exclude',
  recovery: 'exclude',
  private_log: 'exclude',
} as const satisfies Record<JieyuDataClass, 'include' | 'exclude'>;

function namesWhere(
  predicate: (name: JieyuMainTableName, stance: TablePolicyStance) => boolean,
): string[] {
  return (Object.keys(TABLE_POLICY_STANCES) as JieyuMainTableName[])
    .filter((name) => predicate(name, TABLE_POLICY_STANCES[name]))
    .sort();
}

describe('table policy coverage', () => {
  it('recovery names the transcription core, and every other table is an explicit exclude', () => {
    const included = namesWhere((_name, stance) => stance.recovery === 'include');
    // tier_definitions 的行以集合名 layers 写出，表名本身不在恢复名单里。
    expect([...RECOVERY_EXPORT_COLLECTIONS].sort()).toEqual([...included, 'layers'].sort());
    expect(included).not.toContain('tier_definitions');
  });

  it('collab snapshot exclude, include, and the one unread leftover partition the registry', () => {
    expect([...COLLAB_PROJECT_SNAPSHOT_EXCLUDED_COLLECTIONS].sort()).toEqual(
      namesWhere((_name, stance) => stance.collab === 'exclude'),
    );
    const notCopied = namesWhere((_name, stance) => stance.collab === 'not-copied');
    expect(notCopied).toEqual(['ai_runtime_v2_turns']);
    const included = namesWhere((_name, stance) => stance.collab === 'include');
    const projectId = 'p';
    const collections: Record<string, unknown[]> = {
      texts: [{ id: projectId }],
    };
    for (const name of included) {
      if (name === 'texts') continue;
      collections[name] = [
        {
          id: `${name}-1`,
          textId: projectId,
          projectId,
          scopeKey: projectId,
          mediaId: 'media_items-1',
          layerId: 'tier_definitions-1',
          hostTranscriptionLayerId: 'tier_definitions-1',
          tierId: 'tier_definitions-1',
          unitId: 'layer_units-1',
          targetId: name === 'user_notes' ? projectId : 'unit_tokens-1',
          targetType: name === 'user_notes' ? 'text' : 'token',
        },
      ];
    }
    collections.ai_runtime_v2_turns = [
      { conversationId: 'c', expiresAt: '2026-10-16T00:00:00.000Z' },
    ];
    const filtered = filterCollectionsForProject(collections, projectId);
    expect(Object.keys(filtered).sort()).toEqual(
      ['texts', ...included.filter((name) => name !== 'texts')].sort(),
    );
    expect(filtered.ai_runtime_v2_turns).toBeUndefined();
  });

  it('delete-project and replace-content each match their stated include or keep', () => {
    expect([...projectPurgeTableNames('delete-project')].sort()).toEqual(
      namesWhere((_name, stance) => stance.deleteProject === 'include'),
    );
    expect([...PROJECT_PURGE_UNATTRIBUTABLE_TABLES].sort()).toEqual(
      namesWhere((_name, stance) => stance.deleteProject === 'exclude'),
    );
    expect([...projectPurgeTableNames('replace-content')].sort()).toEqual(
      namesWhere((_name, stance) => stance.replaceContent === 'purge'),
    );
  });

  it('import drop and JYB packaging each state every data class, and they differ on project AI', () => {
    expect(NON_JYB_IMPORT_STANCE.project_ai).toBe('drop');
    expect(JYB_PACKAGE_STANCE.project_ai).toBe('include');
    for (const name of Object.keys(JIEYU_MAIN_TABLE_REGISTRY) as JieyuMainTableName[]) {
      const dataClass = JIEYU_MAIN_TABLE_REGISTRY[name].dataClass;
      const dropped = NON_JYB_IMPORT_STANCE[dataClass] === 'drop';
      expect(isCollectionDroppedOnImport(name), name).toBe(dropped);
      expect(isCollectionDroppedOnImport(name, { keepProjectAi: true }), name).toBe(
        dataClass === 'project_ai' ? false : dropped,
      );
      expect(JIEYU_DATA_CLASS_IN_JYB[dataClass], dataClass).toBe(
        JYB_PACKAGE_STANCE[dataClass] === 'include',
      );
    }
  });
});
