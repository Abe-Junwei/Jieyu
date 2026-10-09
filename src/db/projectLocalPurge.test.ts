/**
 * T21：删除项目（本地部分）后主库中没有残留；另一个项目不受影响（rev5 N6）。
 * 用基线 schema 建一个不带写入校验的 Dexie，给每张登记的表都放上两个项目各自的行，
 * 这样新增表而忘了处理时这里会失败。
 * T21: after deleting a project (local part) nothing of it remains in the main DB, and another
 * project is untouched. A plain Dexie with the baseline schema gets rows for two projects in every
 * registered table, so a new table that purge forgets makes this fail.
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JIEYU_BASELINE_STORES, type JieyuDatabase } from './engine';
import {
  PROJECT_PURGE_UNATTRIBUTABLE_TABLES,
  projectPurgeTableNames,
  purgeProjectRows,
  type ProjectPurgeMode,
} from './projectLocalPurge';
import { JIEYU_MAIN_TABLE_REGISTRY, type JieyuMainTableName } from './tableRegistry';

type Row = Record<string, unknown> & { id?: string };

/** 项目 `p` 在每张表里的行；主键都以 `${p}-` 开头 | Rows of project `p`; every key starts with `${p}-` */
function seed(p: string): Record<JieyuMainTableName, Row[]> {
  const k = (name: string) => `${p}-${name}`;
  return {
    texts: [{ id: p }],
    media_items: [{ id: k('media'), textId: p }],
    layer_units: [
      { id: k('unit'), textId: p, unitType: 'unit' },
      { id: k('seg'), textId: p, unitType: 'segment', parentUnitId: k('unit') },
    ],
    layer_unit_contents: [
      { id: k('content'), textId: p, unitId: k('unit') },
      { id: k('content-legacy'), unitId: k('unit') },
    ],
    unit_relations: [{ id: k('rel'), textId: p }],
    unit_tokens: [{ id: k('tok'), textId: p, unitId: k('unit') }],
    unit_morphemes: [{ id: k('mor'), textId: p, unitId: k('unit'), tokenId: k('tok') }],
    token_lexeme_links: [
      { id: k('link-tok'), targetType: 'token', targetId: k('tok'), lexemeId: 'shared-lex' },
      { id: k('link-lex'), targetType: 'token', targetId: 'elsewhere', lexemeId: k('lex') },
    ],
    anchors: [{ id: k('anchor'), mediaId: k('media') }],
    layer_links: [
      { id: k('ll'), layerId: k('tier'), hostTranscriptionLayerId: k('tier') },
      { id: k('ll-host'), layerId: 'external', hostTranscriptionLayerId: k('tier') },
    ],
    tier_definitions: [{ id: k('tier'), textId: p }],
    tier_annotations: [{ id: k('ann'), tierId: k('tier') }],
    user_notes: [
      { id: k('note-text'), targetType: 'text', targetId: p },
      { id: k('note-unit'), targetType: 'unit', targetId: k('unit') },
      { id: k('note-tok'), targetType: 'token', targetId: k('tok') },
      { id: k('note-mor'), targetType: 'morpheme', targetId: k('mor') },
      { id: k('note-tr'), targetType: 'translation', targetId: k('content') },
      { id: k('note-ann'), targetType: 'annotation', targetId: k('ann') },
      { id: k('note-lex'), targetType: 'lexeme', targetId: k('lex') },
      { id: k('note-sense'), targetType: 'sense', targetId: 's1', parentTargetId: k('lex') },
      { id: k('note-cell'), targetType: 'tier_annotation', targetId: `${k('unit')}::${k('tier')}` },
    ],
    segment_meta: [{ id: k('sm'), textId: p }],
    track_entities: [{ id: k('track'), textId: p }],
    source_records: [{ id: k('src'), textId: p }],
    annotation_documents: [{ id: k('doc'), textId: p }],
    speakers: [{ id: k('spk'), textId: p }],
    lexemes: [{ id: k('lex'), textId: p }],
    lexeme_assets: [{ id: k('asset'), textId: p }],
    lexeme_asset_links: [{ id: k('asset-link'), textId: p }],
    languages: [{ id: k('lang'), textId: p }],
    language_display_names: [{ id: k('lang-name'), textId: p }],
    language_aliases: [{ id: k('lang-alias'), textId: p }],
    language_catalog_history: [{ id: k('lang-hist'), textId: p }],
    custom_field_definitions: [{ id: k('field'), textId: p }],
    orthographies: [{ id: k('orth'), textId: p }],
    orthography_bridges: [{ id: k('bridge'), textId: p }],
    locations: [{ id: k('loc'), textId: p }],
    bibliographic_sources: [{ id: k('bib'), textId: p }],
    grammar_docs: [{ id: k('grammar'), textId: p }],
    abbreviations: [{ id: k('abbr'), textId: p }],
    phonemes: [{ id: k('phoneme'), textId: p }],
    tag_definitions: [{ id: k('tag'), textId: p }],
    structural_rule_profiles: [{ id: k('profile'), projectId: p }],
    ai_conversations: [{ id: k('conv'), textId: p }],
    ai_messages: [{ id: k('msg'), conversationId: k('conv') }],
    ai_session_memories: [{ conversationId: k('conv') }],
    project_ai_memories: [{ id: k('mem'), projectId: p }],
    ai_tasks: [
      { id: k('task'), targetId: p },
      { id: k('task-unit'), targetId: k('unit') },
    ],
    ai_task_snapshots: [{ id: k('task-snap'), targetId: k('unit') }],
    ai_source_sets: [
      { id: k('set'), projectId: p },
      { id: k('set-media'), mediaId: k('media') },
    ],
    embeddings: [
      { id: k('emb-unit'), sourceType: 'unit', sourceId: k('unit') },
      { id: k('emb-note'), sourceType: 'note', sourceId: k('note-unit') },
    ],
    segment_quality_snapshots: [{ id: k('sq'), textId: p }],
    scope_stats_snapshots: [
      { id: k('ss'), textId: p },
      { id: k('ss-key'), scopeType: 'project', scopeKey: p },
    ],
    speaker_profile_snapshots: [{ id: k('sp'), textId: p }],
    translation_status_snapshots: [{ id: k('ts'), textId: p }],
    language_asset_overviews: [{ id: k('overview'), languageId: k('lang') }],
    audit_logs: [
      { id: k('audit-text'), collection: 'texts', documentId: p },
      { id: k('audit-unit'), collection: 'layer_units', documentId: k('unit') },
    ],
    // 无法归属到项目，删除后保留 | Unattributable, kept
    agent_artifacts: [{ id: k('artifact') }],
    mcp_tool_call_audits: [{ id: k('mcp-audit') }],
    external_mcp_trust: [{ id: k('trust') }],
  };
}

function keyOf(name: string, row: Row): string {
  return String(name === 'ai_session_memories' ? row.conversationId : row.id);
}

let dexie: Dexie;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  dexie = new Dexie(`purge-test-${counter}`);
  dexie.version(1).stores(JIEYU_BASELINE_STORES);
  await dexie.open();
  for (const project of ['pA', 'pB']) {
    for (const [name, rows] of Object.entries(seed(project))) {
      await dexie.table(name).bulkPut(rows);
    }
  }
});

afterEach(async () => {
  dexie.close();
  await Dexie.delete(dexie.name);
});

async function purge(textId: string, mode: ProjectPurgeMode): Promise<void> {
  const handle = dexie as unknown as JieyuDatabase['dexie'];
  const tables = projectPurgeTableNames(mode).map((name) => dexie.table(name));
  await dexie.transaction('rw', tables, () => purgeProjectRows(handle, textId, mode));
}

async function keysIn(name: string): Promise<string[]> {
  return (await dexie.table(name).toArray()).map((row: Row) => keyOf(name, row));
}

describe('purgeProjectRows', () => {
  it('the seed covers every registered main table', () => {
    expect(Object.keys(seed('x')).sort()).toEqual(Object.keys(JIEYU_MAIN_TABLE_REGISTRY).sort());
  });

  it("T21: 'delete-project' leaves no row of the project in any table; the other project is untouched", async () => {
    await purge('pA', 'delete-project');
    const leftovers: string[] = [];
    for (const name of Object.keys(JIEYU_MAIN_TABLE_REGISTRY) as JieyuMainTableName[]) {
      const keys = await keysIn(name);
      const expectedB = seed('pB')[name].map((row) => keyOf(name, row));
      expect(keys, name).toEqual(expect.arrayContaining(expectedB));
      const remainingA = keys.filter((key) => key === 'pA' || key.startsWith('pA-'));
      if (PROJECT_PURGE_UNATTRIBUTABLE_TABLES.has(name)) {
        expect(remainingA, name).toHaveLength(seed('pA')[name].length);
      } else {
        leftovers.push(...remainingA.map((key) => `${name}:${key}`));
      }
    }
    expect(leftovers).toEqual([]);
  });

  it("'replace-content' keeps local AI rows, embeddings and audit logs but clears content and catalog", async () => {
    await purge('pA', 'replace-content');
    expect(await keysIn('texts')).not.toContain('pA');
    expect(await keysIn('layer_links')).not.toContain('pA-ll');
    expect(await keysIn('user_notes')).not.toContain('pA-note-sense');
    expect(await keysIn('lexemes')).not.toContain('pA-lex');
    expect(await keysIn('ai_conversations')).toContain('pA-conv');
    expect(await keysIn('project_ai_memories')).toContain('pA-mem');
    expect(await keysIn('embeddings')).toContain('pA-emb-unit');
    expect(await keysIn('audit_logs')).toContain('pA-audit-unit');
  });
});
