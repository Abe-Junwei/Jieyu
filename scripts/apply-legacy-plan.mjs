/**
 * 把一份已经确认的迁移规划写成音频文件、项目库和 .jyd。
 * 目标文件夹非空就拒绝；失败时只删这次建出来的路径。可由测试导入，也可直接运行：
 * node --experimental-sqlite scripts/apply-legacy-plan.mjs <plan.json> <dest>
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const JYD_APPLICATION_ID = 0x4a594443;
const PROJECT_APPLICATION_ID = 0x4a59504a;

const LANGUAGE_EXTRAS = [
  ['languageCode', 'language_code', 'TEXT'],
  ['canonicalTag', 'canonical_tag', 'TEXT'],
  ['iso6391', 'iso6391', 'TEXT'],
  ['iso6392B', 'iso6392b', 'TEXT'],
  ['iso6392T', 'iso6392t', 'TEXT'],
  ['iso6393', 'iso6393', 'TEXT'],
  ['autonym', 'autonym', 'TEXT'],
  ['glottocode', 'glottocode', 'TEXT'],
  ['wikidataId', 'wikidata_id', 'TEXT'],
  ['scope', 'scope', 'TEXT'],
  ['macrolanguage', 'macrolanguage', 'TEXT'],
  ['genus', 'genus', 'TEXT'],
  ['subfamily', 'subfamily', 'TEXT'],
  ['branch', 'branch', 'TEXT'],
  ['classificationPath', 'classification_path', 'TEXT'],
  ['modality', 'modality', 'TEXT'],
  ['languageType', 'language_type', 'TEXT'],
  ['endangermentLevel', 'endangerment_level', 'TEXT'],
  ['aesStatus', 'aes_status', 'TEXT'],
  ['endangermentSource', 'endangerment_source', 'TEXT'],
  ['endangermentAssessmentYear', 'endangerment_assessment_year', 'INTEGER'],
  ['speakerCountL1', 'speaker_count_l1', 'INTEGER'],
  ['speakerCountL2', 'speaker_count_l2', 'INTEGER'],
  ['speakerCountSource', 'speaker_count_source', 'TEXT'],
  ['speakerCountYear', 'speaker_count_year', 'INTEGER'],
  ['speakerTrend', 'speaker_trend', 'TEXT'],
  ['macroarea', 'macroarea', 'TEXT'],
  ['intergenerationalTransmission', 'intergenerational_transmission', 'TEXT'],
  ['officialStatus', 'official_status', 'TEXT'],
  ['egids', 'egids', 'TEXT'],
  ['documentationLevel', 'documentation_level', 'TEXT'],
  ['literacyRate', 'literacy_rate', 'REAL'],
  ['latitude', 'latitude', 'REAL'],
  ['longitude', 'longitude', 'REAL'],
  ['locationId', 'location_id', 'TEXT'],
  ['sourceType', 'source_type', 'TEXT'],
  ['reviewStatus', 'review_status', 'TEXT'],
  ['visibility', 'visibility', 'TEXT'],
];

const LANGUAGE_JSON = [
  ['countries', 'countries'],
  ['countriesOfficial', 'countries_official'],
  ['administrativeDivisions', 'administrative_divisions'],
  ['domains', 'domains'],
  ['dialects', 'dialects'],
  ['vernaculars', 'vernaculars'],
  ['writingSystems', 'writing_systems'],
  ['notes', 'notes'],
  ['customFields', 'custom_fields'],
];

function objectJson(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`applyPlan: ${label} is not an object`);
  }
  const json = JSON.stringify(value);
  const parsed = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`applyPlan: ${label} is not an object`);
  }
  return json;
}

function parseObjectColumn(json, label) {
  const value = JSON.parse(json);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value;
}

function stringColumn(value, label) {
  if (typeof value !== 'string') throw new Error(`applyPlan: ${label} is not a string`);
  return value;
}

function sampleCasesJson(value, label) {
  if (!Array.isArray(value)) throw new Error(`applyPlan: ${label} is not an array`);
  return JSON.stringify(value);
}

function parseArrayColumn(json, label) {
  const value = JSON.parse(json);
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
}

function laneLockJson(value, label) {
  const json = objectJson(value, label);
  const parsed = JSON.parse(json);
  if (Object.values(parsed).some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new Error(`applyPlan: ${label} is not a map of finite numbers`);
  }
  return json;
}

function definedFields(row, pairs) {
  const out = {};
  for (const [camel, column] of pairs) {
    if (row[column] !== null && row[column] !== undefined) out[camel] = row[column];
  }
  return out;
}

const PROJECT_FILE = 'project.sqlite';
const STAGING_PREFIX = '.jieyu-staging-';
const WINDOWS_ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/u;

export class DestinationNotEmptyError extends Error {
  constructor(dest, entries) {
    super(`applyPlan: ${dest} is not empty (${entries.slice(0, 5).join(', ')})`);
    this.name = 'DestinationNotEmptyError';
    this.code = 'DESTINATION_NOT_EMPTY';
    this.entries = entries;
  }
}

function foldName(name) {
  return name.normalize('NFC').toUpperCase().toLowerCase();
}

/** 每个文件名必须是目标文件夹里的一段，且忽略大小写后互不相同。规划已经保证，这里再挡一次。 */
function assertFileNames(root, names) {
  const seen = new Set();
  for (const name of names) {
    const safe =
      typeof name === 'string' &&
      name.length > 0 &&
      name !== '.' &&
      name !== '..' &&
      !WINDOWS_ILLEGAL.test(name) &&
      !/[. ]$/u.test(name) &&
      !name.startsWith(STAGING_PREFIX) &&
      path.resolve(root, name) === path.join(root, name) &&
      path.dirname(path.join(root, name)) === root;
    if (!safe) throw new Error(`applyPlan: unsafe file name ${JSON.stringify(name)}`);
    const key = foldName(name);
    if (seen.has(key)) throw new Error(`applyPlan: duplicate file name ${JSON.stringify(name)}`);
    seen.add(key);
  }
}

function writeDatabase(file, applicationId, created, apply) {
  fs.closeSync(fs.openSync(file, 'wx'));
  created.push({ kind: 'file', path: file });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`PRAGMA application_id = ${applicationId}`);
      db.exec('PRAGMA user_version = 1');
      apply(db);
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // 语句失败时 SQLite 可能已经自己回滚了。
      }
      throw error;
    }
  } finally {
    db.close();
  }
}

function sameIds(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

/** 暂存目录写完后整份读回，对不上就不放进目标文件夹。 */
function verifyStaged(plan, staging) {
  const mismatch = (what) => {
    throw new Error(`applyPlan readback mismatch: ${what}`);
  };
  for (const [file, applicationId] of [
    [PROJECT_FILE, PROJECT_APPLICATION_ID],
    ...plan.manuscripts.map((manuscript) => [manuscript.fileName, JYD_APPLICATION_ID]),
  ]) {
    const db = new DatabaseSync(path.join(staging, file), { readOnly: true });
    try {
      if (db.prepare('PRAGMA application_id').get().application_id !== applicationId) {
        mismatch(`${file} application_id`);
      }
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') {
        mismatch(`${file} integrity_check`);
      }
    } finally {
      db.close();
    }
  }
  const read = readProject(staging);
  const audioKey = (rows) =>
    rows
      .map((row) => `${row.id}\0${row.relPath}\0${row.sha256}`)
      .sort()
      .join('\n');
  const plannedAudios = plan.audios.map((audio) => ({
    id: audio.audioId,
    relPath: audio.fileName,
    sha256: audio.sha256,
  }));
  if (audioKey(read.audios) !== audioKey(plannedAudios)) mismatch('audio rows');
  for (const audio of plan.audios) {
    const bytes = fs.readFileSync(path.join(staging, audio.fileName));
    if (createHash('sha256').update(bytes).digest('hex') !== audio.sha256) {
      mismatch(`${audio.fileName} sha256`);
    }
  }
  if ((read.project?.id ?? null) !== (plan.project?.id ?? null)) mismatch('project row');
  for (const [key, rows] of Object.entries(read)) {
    if (key === 'audios' || key === 'manuscripts' || !Array.isArray(rows)) continue;
    if (rows.length !== (plan[key] ?? []).length) mismatch(`${key} count`);
  }
  if (read.manuscripts.length !== plan.manuscripts.length) mismatch('manuscript count');
  const byFile = new Map(read.manuscripts.map((manuscript) => [manuscript.fileName, manuscript]));
  for (const manuscript of plan.manuscripts) {
    const back = byFile.get(manuscript.fileName);
    if (
      !back ||
      back.id !== manuscript.id ||
      back.audioId !== (manuscript.audioId ?? null) ||
      back.sourceDocumentId !== manuscript.sourceDocumentId ||
      !sameIds(
        back.units.map((unit) => unit.id),
        manuscript.units.map((unit) => unit.id),
      ) ||
      !sameIds(
        back.anchors.map((anchor) => anchor.id),
        (manuscript.anchors ?? []).map((anchor) => anchor.id),
      ) ||
      back.contents.length !== (manuscript.contents ?? []).length ||
      back.tokens.length !== (manuscript.tokens ?? []).length
    ) {
      mismatch(`manuscript ${manuscript.fileName}`);
    }
  }
}

/** 只删这次运行建出来的路径，倒着删。某一项删不掉也接着删其余的。 */
function rollback(created) {
  const errors = [];
  for (const entry of [...created].reverse()) {
    try {
      if (entry.kind === 'staging') fs.rmSync(entry.path, { recursive: true, force: true });
      else if (entry.kind === 'dir') fs.rmdirSync(entry.path);
      else fs.rmSync(entry.path, { force: true });
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

/**
 * 目标文件夹必须不存在或为空，否则写之前就拒绝。
 * 先全部写进 `dest/.jieyu-staging-<opId>/`（每个文件独占创建，每个库一次事务），读回无误后再逐个移进目标，
 * `project.sqlite` 最后一个移。被杀掉时目标里最多剩下暂存目录和不带 `project.sqlite` 的半份文件。
 */
export function applyPlan(
  plan,
  dest,
  { opId = randomUUID(), failAfterAudio = false, failDuringProject = false, onStep } = {},
) {
  if (plan?.status !== 'ready') {
    throw new Error(`applyPlan: plan status is ${plan?.status ?? 'missing'}, not ready`);
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(opId)) throw new Error(`applyPlan: bad opId ${opId}`);
  const root = path.resolve(dest);
  const names = [
    ...plan.audios.map((audio) => audio.fileName),
    ...plan.manuscripts.map((manuscript) => manuscript.fileName),
    PROJECT_FILE,
  ];
  assertFileNames(root, names);
  if (fs.existsSync(root)) {
    if (!fs.statSync(root).isDirectory()) throw new DestinationNotEmptyError(root, ['(a file)']);
    const entries = fs.readdirSync(root);
    if (entries.length > 0) throw new DestinationNotEmptyError(root, entries);
  }
  const step = (name) => onStep?.(name);
  const created = [];
  try {
    if (!fs.existsSync(root)) {
      const first = fs.mkdirSync(root, { recursive: true });
      const dirs = [];
      for (let dir = root; first !== undefined; dir = path.dirname(dir)) {
        dirs.unshift(dir);
        if (dir === first || dir === path.dirname(dir)) break;
      }
      for (const dir of dirs) created.push({ kind: 'dir', path: dir });
    }
    const staging = path.join(root, `${STAGING_PREFIX}${opId}`);
    fs.mkdirSync(staging);
    created.push({ kind: 'staging', path: staging });
    for (const audio of plan.audios) {
      const file = path.join(staging, audio.fileName);
      fs.writeFileSync(file, audio.bytes, { flag: 'wx' });
      created.push({ kind: 'file', path: file });
      const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (hash !== audio.sha256) throw new Error('sha256 mismatch');
    }
    step('audio');
    if (failAfterAudio) throw new Error('injected failure');
    const projectFile = path.join(staging, PROJECT_FILE);
    writeDatabase(projectFile, PROJECT_APPLICATION_ID, created, (db) => {
      if (failDuringProject) throw new Error('injected project failure');
      db.exec('CREATE TABLE audio (id TEXT PRIMARY KEY, relpath TEXT, sha256 TEXT)');
      db.exec(
        'CREATE TABLE project (id TEXT PRIMARY KEY, name TEXT NOT NULL, speaker_ids_json TEXT)',
      );
      db.exec(
        'CREATE TABLE speakers (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT, updated_at TEXT)',
      );
      db.exec(
        `CREATE TABLE languages (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, name TEXT NOT NULL, ${LANGUAGE_EXTRAS.map(([, column, type]) => `${column} ${type}`).join(', ')}, ${LANGUAGE_JSON.map(([, column]) => `${column} TEXT`).join(', ')})`,
      );
      db.exec(
        'CREATE TABLE language_display_names (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, language_id TEXT NOT NULL, locale TEXT NOT NULL, value TEXT NOT NULL)',
      );
      db.exec(
        'CREATE TABLE language_aliases (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, language_id TEXT NOT NULL, alias TEXT NOT NULL)',
      );
      db.exec(
        'CREATE TABLE orthographies (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, name TEXT NOT NULL, language_id TEXT)',
      );
      db.exec(
        'CREATE TABLE source_records (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, original_name TEXT NOT NULL, display_name TEXT NOT NULL, format TEXT NOT NULL, media_id TEXT)',
      );
      db.exec(
        'CREATE TABLE lexemes (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, headword TEXT NOT NULL, kind TEXT, usage_count INTEGER, access_rights TEXT, entry_json TEXT, resource_json TEXT)',
      );
      db.exec(
        'CREATE TABLE phonemes (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, language_id TEXT NOT NULL, ipa TEXT NOT NULL, type TEXT NOT NULL)',
      );
      db.exec(
        'CREATE TABLE abbreviations (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, abbreviation TEXT NOT NULL, category TEXT)',
      );
      db.exec(
        'CREATE TABLE tag_definitions (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, key TEXT NOT NULL, scope TEXT, color TEXT)',
      );
      db.exec(
        'CREATE TABLE bibliographic_sources (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, title TEXT NOT NULL, year INTEGER, source_type TEXT, citation_key TEXT, access_rights TEXT)',
      );
      db.exec(
        'CREATE TABLE locations (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, latitude REAL, longitude REAL, region TEXT, country TEXT)',
      );
      db.exec(
        'CREATE TABLE grammar_docs (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, parent_id TEXT, sort_order INTEGER, access_rights TEXT)',
      );
      db.exec(
        'CREATE TABLE orthography_bridges (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, source_orthography_id TEXT NOT NULL, target_orthography_id TEXT NOT NULL, engine TEXT NOT NULL, status TEXT, is_reversible INTEGER, name_json TEXT, rules_json TEXT, sample_input TEXT, sample_output TEXT, sample_cases_json TEXT, notes_json TEXT)',
      );
      db.exec(
        'CREATE TABLE custom_field_definitions (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, field_type TEXT NOT NULL, sort_order INTEGER NOT NULL, required INTEGER, min_value REAL, max_value REAL, pattern TEXT)',
      );
      db.exec(
        'CREATE TABLE language_catalog_history (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, language_id TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, reason TEXT, reason_code TEXT, actor_id TEXT, actor_type TEXT, source_type TEXT, source_ref TEXT)',
      );
      db.exec(
        'CREATE TABLE lexeme_assets (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT NOT NULL, display_name TEXT NOT NULL, language_code TEXT, byte_size INTEGER NOT NULL, ref_count INTEGER NOT NULL, blob_export_omitted INTEGER)',
      );
      db.exec(
        'CREATE TABLE lexeme_asset_links (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, lexeme_id TEXT NOT NULL, asset_id TEXT NOT NULL)',
      );
      db.exec(
        'CREATE TABLE structural_rule_profiles (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, scope TEXT NOT NULL, language_id TEXT, derived_from_system_id TEXT, enabled INTEGER NOT NULL, priority INTEGER NOT NULL, profile_json TEXT)',
      );
      db.exec(
        'CREATE TABLE ai_conversations (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, title TEXT NOT NULL, mode TEXT NOT NULL, provider_id TEXT NOT NULL, model TEXT NOT NULL, archived INTEGER, cleared_at TEXT)',
      );
      db.exec(
        'CREATE TABLE ai_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, generation_source TEXT, generation_model TEXT, error_message TEXT)',
      );
      db.exec(
        'CREATE TABLE ai_tasks (id TEXT PRIMARY KEY, task_type TEXT NOT NULL, status TEXT NOT NULL, target_id TEXT NOT NULL, target_type TEXT, model_id TEXT, error_message TEXT, attempt INTEGER, max_attempts INTEGER, timeout_ms INTEGER, resumable INTEGER, handoff_reason TEXT, agent_run_id TEXT)',
      );
      db.exec(
        'CREATE TABLE ai_task_snapshots (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, task_type TEXT NOT NULL, status TEXT NOT NULL, target_id TEXT NOT NULL, target_type TEXT, model_id TEXT, has_error INTEGER NOT NULL, is_terminal INTEGER NOT NULL, duration_ms INTEGER NOT NULL, attempt INTEGER, max_attempts INTEGER, resumable INTEGER, handoff_reason TEXT)',
      );
      db.exec(
        'CREATE TABLE project_ai_memories (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, fact TEXT NOT NULL, confidence REAL NOT NULL, source_conversation_id TEXT, expires_at TEXT)',
      );
      db.exec(
        'CREATE TABLE agent_artifacts (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, kind TEXT NOT NULL, uri TEXT NOT NULL, title TEXT NOT NULL, mime_type TEXT NOT NULL, body_json TEXT NOT NULL, agent_run_id TEXT, adoption_item_id TEXT)',
      );
      db.exec(
        'CREATE TABLE ai_source_sets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL, media_id TEXT, layer_id TEXT, bound_session_id TEXT)',
      );
      db.exec(
        'CREATE TABLE ai_session_memories (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)',
      );
      db.exec(
        'CREATE TABLE model_runs (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, model_id TEXT NOT NULL, model_version TEXT NOT NULL, manifest_sha256 TEXT NOT NULL, capability TEXT NOT NULL, params_json TEXT NOT NULL, media_id TEXT NOT NULL, range_start REAL NOT NULL, range_end REAL NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, error_code TEXT, chunk_count INTEGER NOT NULL, accepted_count INTEGER NOT NULL, rejected_count INTEGER NOT NULL, pending_count INTEGER NOT NULL)',
      );
      db.exec(
        'CREATE TABLE user_notes (id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, text TEXT NOT NULL)',
      );
      const insert = db.prepare('INSERT INTO audio (id, relpath, sha256) VALUES (?, ?, ?)');
      for (const audio of plan.audios) insert.run(audio.audioId, audio.fileName, audio.sha256);
      if (plan.project) {
        db.prepare('INSERT INTO project (id, name) VALUES (?, ?)').run(
          plan.project.id,
          plan.project.name,
        );
      }
      const insertSpeaker = db.prepare('INSERT INTO speakers (id, text_id, name) VALUES (?, ?, ?)');
      for (const speaker of plan.speakers ?? []) {
        insertSpeaker.run(speaker.id, speaker.textId, speaker.name);
      }
      const insertLanguage = db.prepare(
        `INSERT INTO languages (id, text_id, name, ${[...LANGUAGE_EXTRAS.map(([, column]) => column), ...LANGUAGE_JSON.map(([, column]) => column)].join(', ')}) VALUES (${['?', '?', '?', ...LANGUAGE_EXTRAS.map(() => '?'), ...LANGUAGE_JSON.map(() => '?')].join(', ')})`,
      );
      for (const language of plan.languages ?? []) {
        insertLanguage.run(
          language.id,
          language.textId,
          language.name,
          ...LANGUAGE_EXTRAS.map(([camel]) => language[camel] ?? null),
          ...LANGUAGE_JSON.map(([camel]) =>
            language[camel] === undefined ? null : JSON.stringify(language[camel]),
          ),
        );
      }
      const insertDisplayName = db.prepare(
        'INSERT INTO language_display_names (id, text_id, language_id, locale, value) VALUES (?, ?, ?, ?, ?)',
      );
      for (const displayName of plan.displayNames ?? []) {
        insertDisplayName.run(
          displayName.id,
          displayName.textId,
          displayName.languageId,
          displayName.locale,
          displayName.value,
        );
      }
      const insertAlias = db.prepare(
        'INSERT INTO language_aliases (id, text_id, language_id, alias) VALUES (?, ?, ?, ?)',
      );
      for (const alias of plan.aliases ?? [])
        insertAlias.run(alias.id, alias.textId, alias.languageId, alias.alias);
      const insertOrthography = db.prepare(
        'INSERT INTO orthographies (id, text_id, name, language_id) VALUES (?, ?, ?, ?)',
      );
      for (const orthography of plan.orthographies ?? []) {
        insertOrthography.run(
          orthography.id,
          orthography.textId,
          orthography.name,
          orthography.languageId ?? null,
        );
      }
      const insertSource = db.prepare(
        'INSERT INTO source_records (id, text_id, original_name, display_name, format, media_id) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const source of plan.sourceRecords ?? []) {
        insertSource.run(
          source.id,
          source.textId,
          source.originalName,
          source.displayName,
          source.format,
          source.mediaId ?? null,
        );
      }
      const insertLexeme = db.prepare(
        'INSERT INTO lexemes (id, text_id, headword, kind, usage_count, access_rights, entry_json, resource_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const lexeme of plan.lexemes ?? []) {
        if (lexeme.kind === 'resource' && lexeme.entry !== undefined) {
          throw new Error(`applyPlan: lexeme ${lexeme.id} resource row has an entry`);
        }
        if (lexeme.kind !== 'resource' && lexeme.resource !== undefined) {
          throw new Error(`applyPlan: lexeme ${lexeme.id} entry row has a resource`);
        }
        insertLexeme.run(
          lexeme.id,
          lexeme.textId,
          lexeme.headword,
          lexeme.kind ?? null,
          lexeme.usageCount ?? null,
          lexeme.accessRights ?? null,
          lexeme.entry === undefined ? null : objectJson(lexeme.entry, `lexeme ${lexeme.id} entry`),
          lexeme.resource === undefined
            ? null
            : objectJson(lexeme.resource, `lexeme ${lexeme.id} resource`),
        );
      }
      const insertPhoneme = db.prepare(
        'INSERT INTO phonemes (id, text_id, language_id, ipa, type) VALUES (?, ?, ?, ?, ?)',
      );
      for (const phoneme of plan.phonemes ?? []) {
        insertPhoneme.run(
          phoneme.id,
          phoneme.textId,
          phoneme.languageId,
          phoneme.ipa,
          phoneme.type,
        );
      }
      const insertAbbreviation = db.prepare(
        'INSERT INTO abbreviations (id, text_id, abbreviation, category) VALUES (?, ?, ?, ?)',
      );
      for (const row of plan.abbreviations ?? []) {
        insertAbbreviation.run(row.id, row.textId, row.abbreviation, row.category ?? null);
      }
      const insertTag = db.prepare(
        'INSERT INTO tag_definitions (id, text_id, key, scope, color) VALUES (?, ?, ?, ?, ?)',
      );
      for (const tag of plan.tagDefinitions ?? []) {
        insertTag.run(tag.id, tag.textId, tag.key, tag.scope ?? null, tag.color ?? null);
      }
      const insertBibliography = db.prepare(
        'INSERT INTO bibliographic_sources (id, text_id, title, year, source_type, citation_key, access_rights) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const source of plan.bibliographicSources ?? []) {
        insertBibliography.run(
          source.id,
          source.textId,
          source.title,
          source.year ?? null,
          source.sourceType ?? null,
          source.citationKey ?? null,
          source.accessRights ?? null,
        );
      }
      const insertLocation = db.prepare(
        'INSERT INTO locations (id, text_id, latitude, longitude, region, country) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const location of plan.locations ?? []) {
        insertLocation.run(
          location.id,
          location.textId,
          location.latitude ?? null,
          location.longitude ?? null,
          location.region ?? null,
          location.country ?? null,
        );
      }
      const insertGrammar = db.prepare(
        'INSERT INTO grammar_docs (id, text_id, title, content, parent_id, sort_order, access_rights) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const doc of plan.grammarDocs ?? []) {
        insertGrammar.run(
          doc.id,
          doc.textId,
          doc.title,
          doc.content,
          doc.parentId ?? null,
          doc.sortOrder ?? null,
          doc.accessRights ?? null,
        );
      }
      const insertBridge = db.prepare(
        'INSERT INTO orthography_bridges (id, text_id, source_orthography_id, target_orthography_id, engine, status, is_reversible, name_json, rules_json, sample_input, sample_output, sample_cases_json, notes_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const bridge of plan.orthographyBridges ?? []) {
        insertBridge.run(
          bridge.id,
          bridge.textId,
          bridge.sourceOrthographyId,
          bridge.targetOrthographyId,
          bridge.engine,
          bridge.status ?? null,
          bridge.isReversible === undefined ? null : bridge.isReversible ? 1 : 0,
          bridge.name === undefined ? null : objectJson(bridge.name, `bridge ${bridge.id} name`),
          bridge.rules === undefined ? null : objectJson(bridge.rules, `bridge ${bridge.id} rules`),
          bridge.sampleInput === undefined
            ? null
            : stringColumn(bridge.sampleInput, `bridge ${bridge.id} sampleInput`),
          bridge.sampleOutput === undefined
            ? null
            : stringColumn(bridge.sampleOutput, `bridge ${bridge.id} sampleOutput`),
          bridge.sampleCases === undefined
            ? null
            : sampleCasesJson(bridge.sampleCases, `bridge ${bridge.id} sampleCases`),
          bridge.notes === undefined ? null : objectJson(bridge.notes, `bridge ${bridge.id} notes`),
        );
      }
      const insertCustomField = db.prepare(
        'INSERT INTO custom_field_definitions (id, text_id, field_type, sort_order, required, min_value, max_value, pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const field of plan.customFields ?? []) {
        insertCustomField.run(
          field.id,
          field.textId,
          field.fieldType,
          field.sortOrder,
          field.required === undefined ? null : field.required ? 1 : 0,
          field.minValue ?? null,
          field.maxValue ?? null,
          field.pattern ?? null,
        );
      }
      const insertHistory = db.prepare(
        'INSERT INTO language_catalog_history (id, text_id, language_id, action, summary, reason, reason_code, actor_id, actor_type, source_type, source_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const entry of plan.catalogHistory ?? []) {
        insertHistory.run(
          entry.id,
          entry.textId,
          entry.languageId,
          entry.action,
          entry.summary,
          entry.reason ?? null,
          entry.reasonCode ?? null,
          entry.actorId ?? null,
          entry.actorType ?? null,
          entry.sourceType ?? null,
          entry.sourceRef ?? null,
        );
      }
      const bit = (value) => (value === undefined ? null : value ? 1 : 0);
      const insertAsset = db.prepare(
        'INSERT INTO lexeme_assets (id, text_id, kind, mime_type, display_name, language_code, byte_size, ref_count, blob_export_omitted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const asset of plan.lexemeAssets ?? []) {
        insertAsset.run(
          asset.id,
          asset.textId,
          asset.kind,
          asset.mimeType,
          asset.displayName,
          asset.languageCode ?? null,
          asset.byteSize,
          asset.refCount,
          bit(asset.blobExportOmitted),
        );
      }
      const insertAssetLink = db.prepare(
        'INSERT INTO lexeme_asset_links (id, text_id, lexeme_id, asset_id) VALUES (?, ?, ?, ?)',
      );
      for (const link of plan.lexemeAssetLinks ?? []) {
        insertAssetLink.run(link.id, link.textId, link.lexemeId, link.assetId);
      }
      const insertRule = db.prepare(
        'INSERT INTO structural_rule_profiles (id, project_id, scope, language_id, derived_from_system_id, enabled, priority, profile_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const rule of plan.structuralRules ?? []) {
        insertRule.run(
          rule.id,
          rule.projectId,
          rule.scope,
          rule.languageId ?? null,
          rule.derivedFromSystemId ?? null,
          rule.enabled ? 1 : 0,
          rule.priority,
          rule.profile === undefined ? null : objectJson(rule.profile, `rule ${rule.id} profile`),
        );
      }
      const insertConversation = db.prepare(
        'INSERT INTO ai_conversations (id, text_id, title, mode, provider_id, model, archived, cleared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const conversation of plan.conversations ?? []) {
        insertConversation.run(
          conversation.id,
          conversation.textId,
          conversation.title,
          conversation.mode,
          conversation.providerId,
          conversation.model,
          bit(conversation.archived),
          conversation.clearedAt ?? null,
        );
      }
      const insertSessionMemory = db.prepare(
        'INSERT INTO ai_session_memories (id, conversation_id, payload_json, updated_at) VALUES (?, ?, ?, ?)',
      );
      for (const memory of plan.sessionMemories ?? []) {
        if (memory.id !== memory.conversationId) {
          throw new Error(`applyPlan: session memory ${memory.id} does not match its conversation`);
        }
        insertSessionMemory.run(
          memory.id,
          memory.conversationId,
          objectJson(memory.payload, `session memory ${memory.id}`),
          memory.updatedAt,
        );
      }
      const modelRunStatuses = new Set(['running', 'ok', 'error', 'cancelled']);
      const insertModelRun = db.prepare(
        'INSERT INTO model_runs (id, text_id, model_id, model_version, manifest_sha256, capability, params_json, media_id, range_start, range_end, started_at, finished_at, status, error_code, chunk_count, accepted_count, rejected_count, pending_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const run of plan.modelRuns ?? []) {
        if (run.capability !== 'transcribe' || !modelRunStatuses.has(run.status)) {
          throw new Error(`applyPlan: model run ${run.id} is outside ADR-0057`);
        }
        insertModelRun.run(
          run.id,
          run.textId,
          run.modelId,
          run.modelVersion,
          run.manifestSha256,
          run.capability,
          objectJson(run.params, `model run ${run.id}`),
          run.mediaId,
          run.rangeStart,
          run.rangeEnd,
          run.startedAt,
          run.finishedAt ?? null,
          run.status,
          run.errorCode ?? null,
          run.chunkCount,
          run.acceptedCount,
          run.rejectedCount,
          run.pendingCount,
        );
      }
      const insertMessage = db.prepare(
        'INSERT INTO ai_messages (id, conversation_id, role, content, status, generation_source, generation_model, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const message of plan.aiMessages ?? []) {
        insertMessage.run(
          message.id,
          message.conversationId,
          message.role,
          message.content,
          message.status,
          message.generationSource ?? null,
          message.generationModel ?? null,
          message.errorMessage ?? null,
        );
      }
      const insertTask = db.prepare(
        'INSERT INTO ai_tasks (id, task_type, status, target_id, target_type, model_id, error_message, attempt, max_attempts, timeout_ms, resumable, handoff_reason, agent_run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const task of plan.aiTasks ?? []) {
        insertTask.run(
          task.id,
          task.taskType,
          task.status,
          task.targetId,
          task.targetType ?? null,
          task.modelId ?? null,
          task.errorMessage ?? null,
          task.attempt ?? null,
          task.maxAttempts ?? null,
          task.timeoutMs ?? null,
          bit(task.resumable),
          task.handoffReason ?? null,
          task.agentRunId ?? null,
        );
      }
      const insertSnapshot = db.prepare(
        'INSERT INTO ai_task_snapshots (id, task_id, task_type, status, target_id, target_type, model_id, has_error, is_terminal, duration_ms, attempt, max_attempts, resumable, handoff_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const snapshot of plan.aiTaskSnapshots ?? []) {
        insertSnapshot.run(
          snapshot.id,
          snapshot.taskId,
          snapshot.taskType,
          snapshot.status,
          snapshot.targetId,
          snapshot.targetType ?? null,
          snapshot.modelId ?? null,
          snapshot.hasError ? 1 : 0,
          snapshot.isTerminal ? 1 : 0,
          snapshot.durationMs,
          snapshot.attempt ?? null,
          snapshot.maxAttempts ?? null,
          bit(snapshot.resumable),
          snapshot.handoffReason ?? null,
        );
      }
      const insertMemory = db.prepare(
        'INSERT INTO project_ai_memories (id, project_id, fact, confidence, source_conversation_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const memory of plan.projectMemories ?? []) {
        insertMemory.run(
          memory.id,
          memory.projectId,
          memory.fact,
          memory.confidence,
          memory.sourceConversationId ?? null,
          memory.expiresAt ?? null,
        );
      }
      const insertArtifact = db.prepare(
        'INSERT INTO agent_artifacts (id, schema_version, kind, uri, title, mime_type, body_json, agent_run_id, adoption_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const artifact of plan.agentArtifacts ?? []) {
        insertArtifact.run(
          artifact.id,
          artifact.schemaVersion,
          artifact.kind,
          artifact.uri,
          artifact.title,
          artifact.mimeType,
          artifact.bodyJson,
          artifact.agentRunId ?? null,
          artifact.adoptionItemId ?? null,
        );
      }
      const insertSourceSet = db.prepare(
        'INSERT INTO ai_source_sets (id, project_id, name, scope, status, media_id, layer_id, bound_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const sourceSet of plan.aiSourceSets ?? []) {
        insertSourceSet.run(
          sourceSet.id,
          sourceSet.projectId,
          sourceSet.name,
          sourceSet.scope,
          sourceSet.status,
          sourceSet.mediaId ?? null,
          sourceSet.layerId ?? null,
          sourceSet.boundSessionId ?? null,
        );
      }
      const insertNote = db.prepare(
        'INSERT INTO user_notes (id, target_type, target_id, text) VALUES (?, ?, ?, ?)',
      );
      for (const note of plan.notes ?? []) {
        insertNote.run(note.id, note.targetType, note.targetId, note.text);
      }
      step('project-rows');
    });
    for (const manuscript of plan.manuscripts) {
      const file = path.join(staging, manuscript.fileName);
      writeDatabase(file, JYD_APPLICATION_ID, created, (db) => {
        db.exec('CREATE TABLE meta (id TEXT PRIMARY KEY, audio_id TEXT, source_document_id TEXT)');
        db.exec(
          'CREATE TABLE layers (id TEXT PRIMARY KEY, key TEXT NOT NULL, language_id TEXT, orthography_id TEXT)',
        );
        db.exec(
          'CREATE TABLE units (id TEXT PRIMARY KEY, layer_id TEXT, media_id TEXT, parent_unit_id TEXT, speaker_id TEXT, start_anchor_id TEXT, end_anchor_id TEXT, unit_type TEXT, text_id TEXT, start_time REAL, end_time REAL, updated_at TEXT)',
        );
        db.exec(
          'CREATE TABLE anchors (id TEXT PRIMARY KEY, media_id TEXT NOT NULL, time REAL NOT NULL)',
        );
        db.exec(
          'CREATE TABLE unit_contents (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, text_id TEXT, updated_at TEXT)',
        );
        db.exec(
          'CREATE TABLE unit_relations (id TEXT PRIMARY KEY, source_unit_id TEXT NOT NULL, target_unit_id TEXT NOT NULL, relation_type TEXT NOT NULL)',
        );
        db.exec(
          'CREATE TABLE user_notes (id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, text TEXT NOT NULL)',
        );
        db.exec(
          'CREATE TABLE layer_links (id TEXT PRIMARY KEY, host_layer_id TEXT NOT NULL, layer_id TEXT NOT NULL, link_type TEXT NOT NULL, is_preferred INTEGER NOT NULL)',
        );
        db.exec(
          'CREATE TABLE track_entities (id TEXT PRIMARY KEY, media_id TEXT NOT NULL, mode TEXT NOT NULL, lane_lock_json TEXT, text_id TEXT, updated_at TEXT)',
        );
        db.exec(
          'CREATE TABLE tier_annotations (id TEXT PRIMARY KEY, tier_id TEXT NOT NULL, value TEXT NOT NULL, is_verified INTEGER NOT NULL, start_time REAL, end_time REAL)',
        );
        db.exec('CREATE TABLE languages (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
        db.exec(
          'CREATE TABLE language_display_names (id TEXT PRIMARY KEY, language_id TEXT NOT NULL, locale TEXT NOT NULL, value TEXT NOT NULL)',
        );
        db.exec(
          'CREATE TABLE language_aliases (id TEXT PRIMARY KEY, language_id TEXT NOT NULL, alias TEXT NOT NULL)',
        );
        db.exec(
          'CREATE TABLE orthographies (id TEXT PRIMARY KEY, name TEXT NOT NULL, language_id TEXT)',
        );
        db.exec('CREATE TABLE speakers (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
        db.exec('CREATE TABLE manuscript_sources (source_id TEXT PRIMARY KEY)');
        db.exec(
          'CREATE TABLE token_lexeme_links (id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, lexeme_id TEXT NOT NULL)',
        );
        db.exec(
          'CREATE TABLE tokens (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, token_index INTEGER NOT NULL, form TEXT NOT NULL)',
        );
        db.exec(
          'CREATE TABLE morphemes (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, token_id TEXT NOT NULL, morpheme_index INTEGER NOT NULL, form TEXT NOT NULL)',
        );
        db.prepare('INSERT INTO meta (id, audio_id, source_document_id) VALUES (?, ?, ?)').run(
          manuscript.id,
          manuscript.audioId,
          manuscript.sourceDocumentId,
        );
        const insertLayer = db.prepare(
          'INSERT INTO layers (id, key, language_id, orthography_id) VALUES (?, ?, ?, ?)',
        );
        for (const layer of manuscript.layers ?? []) {
          insertLayer.run(
            layer.id,
            layer.key,
            layer.languageId ?? null,
            layer.orthographyId ?? null,
          );
        }
        const insert = db.prepare(
          'INSERT INTO units (id, layer_id, media_id, parent_unit_id, speaker_id, start_anchor_id, end_anchor_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        for (const unit of manuscript.units) {
          insert.run(
            unit.id,
            unit.layerId ?? null,
            unit.mediaId ?? null,
            unit.parentUnitId ?? null,
            unit.speakerId ?? null,
            unit.startAnchorId ?? null,
            unit.endAnchorId ?? null,
          );
        }
        const insertAnchor = db.prepare(
          'INSERT INTO anchors (id, media_id, time) VALUES (?, ?, ?)',
        );
        for (const anchor of manuscript.anchors ?? []) {
          insertAnchor.run(anchor.id, anchor.mediaId, anchor.time);
        }
        const insertContent = db.prepare(
          'INSERT INTO unit_contents (id, unit_id, role, text) VALUES (?, ?, ?, ?)',
        );
        for (const content of manuscript.contents ?? []) {
          insertContent.run(content.id, content.unitId, content.role, content.text);
        }
        const insertRelation = db.prepare(
          'INSERT INTO unit_relations (id, source_unit_id, target_unit_id, relation_type) VALUES (?, ?, ?, ?)',
        );
        for (const relation of manuscript.relations ?? []) {
          insertRelation.run(
            relation.id,
            relation.sourceUnitId,
            relation.targetUnitId,
            relation.relationType,
          );
        }
        const insertNote = db.prepare(
          'INSERT INTO user_notes (id, target_type, target_id, text) VALUES (?, ?, ?, ?)',
        );
        for (const note of manuscript.notes ?? []) {
          insertNote.run(note.id, note.targetType, note.targetId, note.text);
        }
        const insertLayerLink = db.prepare(
          'INSERT INTO layer_links (id, host_layer_id, layer_id, link_type, is_preferred) VALUES (?, ?, ?, ?, ?)',
        );
        for (const link of manuscript.layerLinks ?? []) {
          insertLayerLink.run(
            link.id,
            link.hostLayerId,
            link.layerId,
            link.linkType,
            link.isPreferred ? 1 : 0,
          );
        }
        const insertTrack = db.prepare(
          'INSERT INTO track_entities (id, media_id, mode, lane_lock_json) VALUES (?, ?, ?, ?)',
        );
        for (const track of manuscript.tracks ?? []) {
          insertTrack.run(
            track.id,
            track.mediaId,
            track.mode,
            track.laneLockMap === undefined
              ? null
              : laneLockJson(track.laneLockMap, `track ${track.id} laneLockMap`),
          );
        }
        const insertAnnotation = db.prepare(
          'INSERT INTO tier_annotations (id, tier_id, value, is_verified, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
        );
        for (const annotation of manuscript.annotations ?? []) {
          insertAnnotation.run(
            annotation.id,
            annotation.tierId,
            annotation.value,
            annotation.isVerified ? 1 : 0,
            annotation.startTime ?? null,
            annotation.endTime ?? null,
          );
        }
        const insertToken = db.prepare(
          'INSERT INTO tokens (id, unit_id, token_index, form) VALUES (?, ?, ?, ?)',
        );
        for (const token of manuscript.tokens ?? []) {
          insertToken.run(token.id, token.unitId, token.tokenIndex, token.form);
        }
        const insertMorpheme = db.prepare(
          'INSERT INTO morphemes (id, unit_id, token_id, morpheme_index, form) VALUES (?, ?, ?, ?, ?)',
        );
        for (const morpheme of manuscript.morphemes ?? []) {
          insertMorpheme.run(
            morpheme.id,
            morpheme.unitId,
            morpheme.tokenId,
            morpheme.morphemeIndex,
            morpheme.form,
          );
        }
        const definitions = manuscript.definitions ?? {
          languages: [],
          displayNames: [],
          aliases: [],
          orthographies: [],
          speakers: [],
        };
        const insertSnapshotLanguage = db.prepare('INSERT INTO languages (id, name) VALUES (?, ?)');
        for (const language of definitions.languages) {
          insertSnapshotLanguage.run(language.id, language.name);
        }
        const insertSnapshotDisplayName = db.prepare(
          'INSERT INTO language_display_names (id, language_id, locale, value) VALUES (?, ?, ?, ?)',
        );
        for (const displayName of definitions.displayNames) {
          insertSnapshotDisplayName.run(
            displayName.id,
            displayName.languageId,
            displayName.locale,
            displayName.value,
          );
        }
        const insertSnapshotAlias = db.prepare(
          'INSERT INTO language_aliases (id, language_id, alias) VALUES (?, ?, ?)',
        );
        for (const alias of definitions.aliases) {
          insertSnapshotAlias.run(alias.id, alias.languageId, alias.alias);
        }
        const insertSnapshotOrthography = db.prepare(
          'INSERT INTO orthographies (id, name, language_id) VALUES (?, ?, ?)',
        );
        for (const orthography of definitions.orthographies) {
          insertSnapshotOrthography.run(
            orthography.id,
            orthography.name,
            orthography.languageId ?? null,
          );
        }
        const insertSnapshotSpeaker = db.prepare('INSERT INTO speakers (id, name) VALUES (?, ?)');
        for (const speaker of definitions.speakers)
          insertSnapshotSpeaker.run(speaker.id, speaker.name);
        const insertSourceRef = db.prepare('INSERT INTO manuscript_sources (source_id) VALUES (?)');
        for (const sourceId of manuscript.sourceIds ?? []) insertSourceRef.run(sourceId);
        const insertLexemeLink = db.prepare(
          'INSERT INTO token_lexeme_links (id, target_type, target_id, lexeme_id) VALUES (?, ?, ?, ?)',
        );
        for (const link of manuscript.lexemeLinks ?? []) {
          insertLexemeLink.run(link.id, link.targetType, link.targetId, link.lexemeId);
        }
        step('manuscript-rows');
      });
    }
    verifyStaged(plan, staging);
    step('staged');
    for (const name of names) {
      const target = path.join(root, name);
      if (fs.existsSync(target)) throw new DestinationNotEmptyError(root, [name]);
      fs.renameSync(path.join(staging, name), target);
      created.push({ kind: 'file', path: target });
    }
    fs.rmdirSync(staging);
    for (const name of names) {
      const target = path.join(root, name);
      if (path.dirname(fs.realpathSync(target)) !== fs.realpathSync(root)) {
        throw new Error(`applyPlan: ${name} landed outside ${root}`);
      }
    }
    step('published');
    return { dest: root, files: names };
  } catch (error) {
    const cleanupErrors = rollback(created);
    if (cleanupErrors.length > 0) error.cleanupErrors = cleanupErrors;
    throw error;
  }
}

export function readProject(dest) {
  const project = new DatabaseSync(path.join(dest, 'project.sqlite'), { readOnly: true });
  const audios = project.prepare('SELECT id, relpath, sha256 FROM audio ORDER BY id').all();
  const projectRow = project.prepare('SELECT id, name, speaker_ids_json FROM project').get();
  const speakers = project
    .prepare('SELECT id, text_id, name, created_at, updated_at FROM speakers ORDER BY id')
    .all();
  const languages = project
    .prepare(
      `SELECT id, text_id, name, ${[...LANGUAGE_EXTRAS.map(([, column]) => column), ...LANGUAGE_JSON.map(([, column]) => column)].join(', ')} FROM languages ORDER BY id`,
    )
    .all();
  const displayNames = project
    .prepare(
      'SELECT id, text_id, language_id, locale, value FROM language_display_names ORDER BY id',
    )
    .all();
  const aliases = project
    .prepare('SELECT id, text_id, language_id, alias FROM language_aliases ORDER BY id')
    .all();
  const orthographies = project
    .prepare('SELECT id, text_id, name, language_id FROM orthographies ORDER BY id')
    .all();
  const sourceRecords = project
    .prepare(
      'SELECT id, text_id, original_name, display_name, format, media_id FROM source_records ORDER BY id',
    )
    .all();
  const lexemes = project
    .prepare(
      'SELECT id, text_id, headword, kind, usage_count, access_rights, entry_json, resource_json FROM lexemes ORDER BY id',
    )
    .all();
  const phonemes = project
    .prepare('SELECT id, text_id, language_id, ipa, type FROM phonemes ORDER BY id')
    .all();
  const abbreviations = project
    .prepare('SELECT id, text_id, abbreviation, category FROM abbreviations ORDER BY id')
    .all();
  const tagDefinitions = project
    .prepare('SELECT id, text_id, key, scope, color FROM tag_definitions ORDER BY id')
    .all();
  const bibliographicSources = project
    .prepare(
      'SELECT id, text_id, title, year, source_type, citation_key, access_rights FROM bibliographic_sources ORDER BY id',
    )
    .all();
  const locations = project
    .prepare('SELECT id, text_id, latitude, longitude, region, country FROM locations ORDER BY id')
    .all();
  const grammarDocs = project
    .prepare(
      'SELECT id, text_id, title, content, parent_id, sort_order, access_rights FROM grammar_docs ORDER BY id',
    )
    .all();
  const orthographyBridges = project
    .prepare(
      'SELECT id, text_id, source_orthography_id, target_orthography_id, engine, status, is_reversible, name_json, rules_json, sample_input, sample_output, sample_cases_json, notes_json FROM orthography_bridges ORDER BY id',
    )
    .all();
  const customFields = project
    .prepare(
      'SELECT id, text_id, field_type, sort_order, required, min_value, max_value, pattern FROM custom_field_definitions ORDER BY sort_order, id',
    )
    .all();
  const catalogHistory = project
    .prepare(
      'SELECT id, text_id, language_id, action, summary, reason, reason_code, actor_id, actor_type, source_type, source_ref FROM language_catalog_history ORDER BY id',
    )
    .all();
  const lexemeAssets = project
    .prepare(
      'SELECT id, text_id, kind, mime_type, display_name, language_code, byte_size, ref_count, blob_export_omitted FROM lexeme_assets ORDER BY id',
    )
    .all();
  const lexemeAssetLinks = project
    .prepare('SELECT id, text_id, lexeme_id, asset_id FROM lexeme_asset_links ORDER BY id')
    .all();
  const structuralRules = project
    .prepare(
      'SELECT id, project_id, scope, language_id, derived_from_system_id, enabled, priority, profile_json FROM structural_rule_profiles ORDER BY id',
    )
    .all();
  const conversations = project
    .prepare(
      'SELECT id, text_id, title, mode, provider_id, model, archived, cleared_at FROM ai_conversations ORDER BY id',
    )
    .all();
  const aiMessages = project
    .prepare(
      'SELECT id, conversation_id, role, content, status, generation_source, generation_model, error_message FROM ai_messages ORDER BY id',
    )
    .all();
  const aiTasks = project
    .prepare(
      'SELECT id, task_type, status, target_id, target_type, model_id, error_message, attempt, max_attempts, timeout_ms, resumable, handoff_reason, agent_run_id FROM ai_tasks ORDER BY id',
    )
    .all();
  const aiTaskSnapshots = project
    .prepare(
      'SELECT id, task_id, task_type, status, target_id, target_type, model_id, has_error, is_terminal, duration_ms, attempt, max_attempts, resumable, handoff_reason FROM ai_task_snapshots ORDER BY id',
    )
    .all();
  const projectMemories = project
    .prepare(
      'SELECT id, project_id, fact, confidence, source_conversation_id, expires_at FROM project_ai_memories ORDER BY id',
    )
    .all();
  const agentArtifacts = project
    .prepare(
      'SELECT id, schema_version, kind, uri, title, mime_type, body_json, agent_run_id, adoption_item_id FROM agent_artifacts ORDER BY id',
    )
    .all();
  const aiSourceSets = project
    .prepare(
      'SELECT id, project_id, name, scope, status, media_id, layer_id, bound_session_id FROM ai_source_sets ORDER BY id',
    )
    .all();
  const sessionMemories = project
    .prepare(
      'SELECT id, conversation_id, payload_json, updated_at FROM ai_session_memories ORDER BY id',
    )
    .all();
  const modelRuns = project
    .prepare(
      'SELECT id, text_id, model_id, model_version, manifest_sha256, capability, params_json, media_id, range_start, range_end, started_at, finished_at, status, error_code, chunk_count, accepted_count, rejected_count, pending_count FROM model_runs ORDER BY id',
    )
    .all();
  const notes = project
    .prepare('SELECT id, target_type, target_id, text FROM user_notes ORDER BY id')
    .all();
  project.close();
  const manuscripts = fs
    .readdirSync(dest)
    .filter((name) => name.endsWith('.jyd'))
    .sort()
    .map((fileName) => {
      const db = new DatabaseSync(path.join(dest, fileName), { readOnly: true });
      const meta = db.prepare('SELECT id, audio_id, source_document_id FROM meta').get();
      const layers = db
        .prepare('SELECT id, key, language_id, orthography_id FROM layers ORDER BY id')
        .all();
      const units = db
        .prepare(
          'SELECT id, layer_id, media_id, parent_unit_id, speaker_id, start_anchor_id, end_anchor_id, unit_type, text_id, start_time, end_time, updated_at FROM units ORDER BY id',
        )
        .all();
      const snapshotLanguages = db.prepare('SELECT id, name FROM languages ORDER BY id').all();
      const snapshotDisplayNames = db
        .prepare('SELECT id, language_id, locale, value FROM language_display_names ORDER BY id')
        .all();
      const snapshotAliases = db
        .prepare('SELECT id, language_id, alias FROM language_aliases ORDER BY id')
        .all();
      const snapshotOrthographies = db
        .prepare('SELECT id, name, language_id FROM orthographies ORDER BY id')
        .all();
      const snapshotSpeakers = db.prepare('SELECT id, name FROM speakers ORDER BY id').all();
      const sourceRefs = db
        .prepare('SELECT source_id FROM manuscript_sources ORDER BY rowid')
        .all();
      const lexemeLinks = db
        .prepare('SELECT id, target_type, target_id, lexeme_id FROM token_lexeme_links ORDER BY id')
        .all();
      const anchors = db.prepare('SELECT id, media_id, time FROM anchors ORDER BY id').all();
      const contents = db
        .prepare(
          'SELECT id, unit_id, role, text, text_id, updated_at FROM unit_contents ORDER BY id',
        )
        .all();
      const relations = db
        .prepare(
          'SELECT id, source_unit_id, target_unit_id, relation_type FROM unit_relations ORDER BY id',
        )
        .all();
      const notes = db
        .prepare('SELECT id, target_type, target_id, text FROM user_notes ORDER BY id')
        .all();
      const layerLinks = db
        .prepare(
          'SELECT id, host_layer_id, layer_id, link_type, is_preferred FROM layer_links ORDER BY id',
        )
        .all();
      const tracks = db
        .prepare(
          'SELECT id, media_id, mode, lane_lock_json, text_id, updated_at FROM track_entities ORDER BY id',
        )
        .all();
      const annotations = db
        .prepare(
          'SELECT id, tier_id, value, is_verified, start_time, end_time FROM tier_annotations ORDER BY id',
        )
        .all();
      const tokens = db
        .prepare('SELECT id, unit_id, token_index, form FROM tokens ORDER BY token_index, id')
        .all();
      const morphemes = db
        .prepare(
          'SELECT id, unit_id, token_id, morpheme_index, form FROM morphemes ORDER BY morpheme_index, id',
        )
        .all();
      db.close();
      return {
        fileName,
        id: meta.id,
        audioId: meta.audio_id,
        sourceDocumentId: meta.source_document_id,
        layers: layers.map((layer) => ({
          id: layer.id,
          key: layer.key,
          ...(layer.language_id !== null ? { languageId: layer.language_id } : {}),
          ...(layer.orthography_id !== null ? { orthographyId: layer.orthography_id } : {}),
        })),
        definitions: {
          languages: snapshotLanguages.map((language) => ({
            id: language.id,
            name: language.name,
          })),
          displayNames: snapshotDisplayNames.map((displayName) => ({
            id: displayName.id,
            languageId: displayName.language_id,
            locale: displayName.locale,
            value: displayName.value,
          })),
          aliases: snapshotAliases.map((alias) => ({
            id: alias.id,
            languageId: alias.language_id,
            alias: alias.alias,
          })),
          orthographies: snapshotOrthographies.map((orthography) => ({
            id: orthography.id,
            name: orthography.name,
            ...(orthography.language_id !== null ? { languageId: orthography.language_id } : {}),
          })),
          speakers: snapshotSpeakers.map((speaker) => ({ id: speaker.id, name: speaker.name })),
        },
        sourceIds: sourceRefs.map((source) => source.source_id),
        lexemeLinks: lexemeLinks.map((link) => ({
          id: link.id,
          targetType: link.target_type,
          targetId: link.target_id,
          lexemeId: link.lexeme_id,
        })),
        anchors: anchors.map((anchor) => ({
          id: anchor.id,
          mediaId: anchor.media_id,
          time: anchor.time,
        })),
        contents: contents.map((content) => ({
          id: content.id,
          unitId: content.unit_id,
          role: content.role,
          text: content.text,
          ...(content.text_id !== null ? { textId: content.text_id } : {}),
          ...(content.updated_at !== null ? { updatedAt: content.updated_at } : {}),
        })),
        relations: relations.map((relation) => ({
          id: relation.id,
          sourceUnitId: relation.source_unit_id,
          targetUnitId: relation.target_unit_id,
          relationType: relation.relation_type,
        })),
        notes: notes.map((note) => ({
          id: note.id,
          targetType: note.target_type,
          targetId: note.target_id,
          text: note.text,
        })),
        layerLinks: layerLinks.map((link) => ({
          id: link.id,
          hostLayerId: link.host_layer_id,
          layerId: link.layer_id,
          linkType: link.link_type,
          isPreferred: link.is_preferred !== 0,
        })),
        tracks: tracks.map((track) => ({
          id: track.id,
          mediaId: track.media_id,
          mode: track.mode,
          ...(track.lane_lock_json !== null
            ? {
                laneLockMap: parseObjectColumn(
                  track.lane_lock_json,
                  `track ${track.id} laneLockMap`,
                ),
              }
            : {}),
          ...(track.text_id !== null ? { textId: track.text_id } : {}),
          ...(track.updated_at !== null ? { updatedAt: track.updated_at } : {}),
        })),
        annotations: annotations.map((annotation) => ({
          id: annotation.id,
          tierId: annotation.tier_id,
          value: annotation.value,
          isVerified: annotation.is_verified !== 0,
          ...(annotation.start_time !== null ? { startTime: annotation.start_time } : {}),
          ...(annotation.end_time !== null ? { endTime: annotation.end_time } : {}),
        })),
        tokens: tokens.map((token) => ({
          id: token.id,
          unitId: token.unit_id,
          tokenIndex: token.token_index,
          form: token.form,
        })),
        morphemes: morphemes.map((morpheme) => ({
          id: morpheme.id,
          unitId: morpheme.unit_id,
          tokenId: morpheme.token_id,
          morphemeIndex: morpheme.morpheme_index,
          form: morpheme.form,
        })),
        units: units.map((unit) => ({
          id: unit.id,
          layerId: unit.layer_id,
          mediaId: unit.media_id,
          parentUnitId: unit.parent_unit_id,
          ...(unit.speaker_id !== null ? { speakerId: unit.speaker_id } : {}),
          ...(unit.unit_type !== null ? { unitType: unit.unit_type } : {}),
          ...(unit.text_id !== null ? { textId: unit.text_id } : {}),
          ...(unit.start_time !== null ? { startTime: unit.start_time } : {}),
          ...(unit.end_time !== null ? { endTime: unit.end_time } : {}),
          ...(unit.updated_at !== null ? { updatedAt: unit.updated_at } : {}),
          ...(unit.start_anchor_id !== null ? { startAnchorId: unit.start_anchor_id } : {}),
          ...(unit.end_anchor_id !== null ? { endAnchorId: unit.end_anchor_id } : {}),
        })),
      };
    });
  return {
    project: projectRow
      ? {
          id: projectRow.id,
          name: projectRow.name,
          ...(projectRow.speaker_ids_json !== null
            ? { speakerIds: JSON.parse(projectRow.speaker_ids_json) }
            : {}),
        }
      : null,
    speakers: speakers.map((speaker) => ({
      id: speaker.id,
      textId: speaker.text_id,
      name: speaker.name,
      ...(speaker.created_at !== null ? { createdAt: speaker.created_at } : {}),
      ...(speaker.updated_at !== null ? { updatedAt: speaker.updated_at } : {}),
    })),
    languages: languages.map((language) => ({
      id: language.id,
      textId: language.text_id,
      name: language.name,
      ...definedFields(language, LANGUAGE_EXTRAS),
      ...definedFields(
        Object.fromEntries(
          LANGUAGE_JSON.map(([, column]) => [
            column,
            language[column] === null ? null : JSON.parse(language[column]),
          ]),
        ),
        LANGUAGE_JSON,
      ),
    })),
    displayNames: displayNames.map((displayName) => ({
      id: displayName.id,
      textId: displayName.text_id,
      languageId: displayName.language_id,
      locale: displayName.locale,
      value: displayName.value,
    })),
    aliases: aliases.map((alias) => ({
      id: alias.id,
      textId: alias.text_id,
      languageId: alias.language_id,
      alias: alias.alias,
    })),
    orthographies: orthographies.map((orthography) => ({
      id: orthography.id,
      textId: orthography.text_id,
      name: orthography.name,
      ...(orthography.language_id !== null ? { languageId: orthography.language_id } : {}),
    })),
    lexemes: lexemes.map((lexeme) => ({
      id: lexeme.id,
      textId: lexeme.text_id,
      headword: lexeme.headword,
      ...(lexeme.kind !== null ? { kind: lexeme.kind } : {}),
      ...(lexeme.usage_count !== null ? { usageCount: lexeme.usage_count } : {}),
      ...(lexeme.access_rights !== null ? { accessRights: lexeme.access_rights } : {}),
      ...(lexeme.entry_json !== null
        ? { entry: parseObjectColumn(lexeme.entry_json, `lexeme ${lexeme.id} entry`) }
        : {}),
      ...(lexeme.resource_json !== null
        ? { resource: parseObjectColumn(lexeme.resource_json, `lexeme ${lexeme.id} resource`) }
        : {}),
    })),
    phonemes: phonemes.map((phoneme) => ({
      id: phoneme.id,
      textId: phoneme.text_id,
      languageId: phoneme.language_id,
      ipa: phoneme.ipa,
      type: phoneme.type,
    })),
    abbreviations: abbreviations.map((row) => ({
      id: row.id,
      textId: row.text_id,
      abbreviation: row.abbreviation,
      ...(row.category !== null ? { category: row.category } : {}),
    })),
    tagDefinitions: tagDefinitions.map((tag) => ({
      id: tag.id,
      textId: tag.text_id,
      key: tag.key,
      ...(tag.scope !== null ? { scope: tag.scope } : {}),
      ...(tag.color !== null ? { color: tag.color } : {}),
    })),
    bibliographicSources: bibliographicSources.map((source) => ({
      id: source.id,
      textId: source.text_id,
      title: source.title,
      ...(source.year !== null ? { year: source.year } : {}),
      ...(source.source_type !== null ? { sourceType: source.source_type } : {}),
      ...(source.citation_key !== null ? { citationKey: source.citation_key } : {}),
      ...(source.access_rights !== null ? { accessRights: source.access_rights } : {}),
    })),
    locations: locations.map((location) => ({
      id: location.id,
      textId: location.text_id,
      ...(location.latitude !== null ? { latitude: location.latitude } : {}),
      ...(location.longitude !== null ? { longitude: location.longitude } : {}),
      ...(location.region !== null ? { region: location.region } : {}),
      ...(location.country !== null ? { country: location.country } : {}),
    })),
    grammarDocs: grammarDocs.map((doc) => ({
      id: doc.id,
      textId: doc.text_id,
      title: doc.title,
      content: doc.content,
      ...(doc.parent_id !== null ? { parentId: doc.parent_id } : {}),
      ...(doc.sort_order !== null ? { sortOrder: doc.sort_order } : {}),
      ...(doc.access_rights !== null ? { accessRights: doc.access_rights } : {}),
    })),
    orthographyBridges: orthographyBridges.map((bridge) => ({
      id: bridge.id,
      textId: bridge.text_id,
      sourceOrthographyId: bridge.source_orthography_id,
      targetOrthographyId: bridge.target_orthography_id,
      engine: bridge.engine,
      ...(bridge.status !== null ? { status: bridge.status } : {}),
      ...(bridge.is_reversible !== null ? { isReversible: bridge.is_reversible !== 0 } : {}),
      ...(bridge.name_json !== null
        ? { name: parseObjectColumn(bridge.name_json, `bridge ${bridge.id} name`) }
        : {}),
      ...(bridge.rules_json !== null
        ? { rules: parseObjectColumn(bridge.rules_json, `bridge ${bridge.id} rules`) }
        : {}),
      ...(bridge.sample_input !== null ? { sampleInput: bridge.sample_input } : {}),
      ...(bridge.sample_output !== null ? { sampleOutput: bridge.sample_output } : {}),
      ...(bridge.sample_cases_json !== null
        ? {
            sampleCases: parseArrayColumn(
              bridge.sample_cases_json,
              `bridge ${bridge.id} sampleCases`,
            ),
          }
        : {}),
      ...(bridge.notes_json !== null
        ? { notes: parseObjectColumn(bridge.notes_json, `bridge ${bridge.id} notes`) }
        : {}),
    })),
    customFields: customFields.map((field) => ({
      id: field.id,
      textId: field.text_id,
      fieldType: field.field_type,
      sortOrder: field.sort_order,
      ...(field.required !== null ? { required: field.required !== 0 } : {}),
      ...(field.min_value !== null ? { minValue: field.min_value } : {}),
      ...(field.max_value !== null ? { maxValue: field.max_value } : {}),
      ...(field.pattern !== null ? { pattern: field.pattern } : {}),
    })),
    catalogHistory: catalogHistory.map((entry) => ({
      id: entry.id,
      textId: entry.text_id,
      languageId: entry.language_id,
      action: entry.action,
      summary: entry.summary,
      ...(entry.reason !== null ? { reason: entry.reason } : {}),
      ...(entry.reason_code !== null ? { reasonCode: entry.reason_code } : {}),
      ...(entry.actor_id !== null ? { actorId: entry.actor_id } : {}),
      ...(entry.actor_type !== null ? { actorType: entry.actor_type } : {}),
      ...(entry.source_type !== null ? { sourceType: entry.source_type } : {}),
      ...(entry.source_ref !== null ? { sourceRef: entry.source_ref } : {}),
    })),
    lexemeAssets: lexemeAssets.map((asset) => ({
      id: asset.id,
      textId: asset.text_id,
      kind: asset.kind,
      mimeType: asset.mime_type,
      displayName: asset.display_name,
      ...(asset.language_code !== null ? { languageCode: asset.language_code } : {}),
      byteSize: asset.byte_size,
      refCount: asset.ref_count,
      ...(asset.blob_export_omitted !== null
        ? { blobExportOmitted: asset.blob_export_omitted !== 0 }
        : {}),
    })),
    lexemeAssetLinks: lexemeAssetLinks.map((link) => ({
      id: link.id,
      textId: link.text_id,
      lexemeId: link.lexeme_id,
      assetId: link.asset_id,
    })),
    structuralRules: structuralRules.map((rule) => ({
      id: rule.id,
      projectId: rule.project_id,
      scope: rule.scope,
      ...(rule.language_id !== null ? { languageId: rule.language_id } : {}),
      ...(rule.derived_from_system_id !== null
        ? { derivedFromSystemId: rule.derived_from_system_id }
        : {}),
      enabled: rule.enabled !== 0,
      priority: rule.priority,
      ...(rule.profile_json !== null
        ? { profile: parseObjectColumn(rule.profile_json, `rule ${rule.id} profile`) }
        : {}),
    })),
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      textId: conversation.text_id,
      title: conversation.title,
      mode: conversation.mode,
      providerId: conversation.provider_id,
      model: conversation.model,
      ...(conversation.archived !== null ? { archived: conversation.archived !== 0 } : {}),
      ...(conversation.cleared_at !== null ? { clearedAt: conversation.cleared_at } : {}),
    })),
    aiMessages: aiMessages.map((message) => ({
      id: message.id,
      conversationId: message.conversation_id,
      role: message.role,
      content: message.content,
      status: message.status,
      ...(message.generation_source !== null
        ? { generationSource: message.generation_source }
        : {}),
      ...(message.generation_model !== null ? { generationModel: message.generation_model } : {}),
      ...(message.error_message !== null ? { errorMessage: message.error_message } : {}),
    })),
    aiTasks: aiTasks.map((task) => ({
      id: task.id,
      taskType: task.task_type,
      status: task.status,
      targetId: task.target_id,
      ...(task.target_type !== null ? { targetType: task.target_type } : {}),
      ...(task.model_id !== null ? { modelId: task.model_id } : {}),
      ...(task.error_message !== null ? { errorMessage: task.error_message } : {}),
      ...(task.attempt !== null ? { attempt: task.attempt } : {}),
      ...(task.max_attempts !== null ? { maxAttempts: task.max_attempts } : {}),
      ...(task.timeout_ms !== null ? { timeoutMs: task.timeout_ms } : {}),
      ...(task.resumable !== null ? { resumable: task.resumable !== 0 } : {}),
      ...(task.handoff_reason !== null ? { handoffReason: task.handoff_reason } : {}),
      ...(task.agent_run_id !== null ? { agentRunId: task.agent_run_id } : {}),
    })),
    aiTaskSnapshots: aiTaskSnapshots.map((snapshot) => ({
      id: snapshot.id,
      taskId: snapshot.task_id,
      taskType: snapshot.task_type,
      status: snapshot.status,
      targetId: snapshot.target_id,
      ...(snapshot.target_type !== null ? { targetType: snapshot.target_type } : {}),
      ...(snapshot.model_id !== null ? { modelId: snapshot.model_id } : {}),
      hasError: snapshot.has_error !== 0,
      isTerminal: snapshot.is_terminal !== 0,
      durationMs: snapshot.duration_ms,
      ...(snapshot.attempt !== null ? { attempt: snapshot.attempt } : {}),
      ...(snapshot.max_attempts !== null ? { maxAttempts: snapshot.max_attempts } : {}),
      ...(snapshot.resumable !== null ? { resumable: snapshot.resumable !== 0 } : {}),
      ...(snapshot.handoff_reason !== null ? { handoffReason: snapshot.handoff_reason } : {}),
    })),
    projectMemories: projectMemories.map((memory) => ({
      id: memory.id,
      projectId: memory.project_id,
      fact: memory.fact,
      confidence: memory.confidence,
      ...(memory.source_conversation_id !== null
        ? { sourceConversationId: memory.source_conversation_id }
        : {}),
      ...(memory.expires_at !== null ? { expiresAt: memory.expires_at } : {}),
    })),
    agentArtifacts: agentArtifacts.map((artifact) => ({
      id: artifact.id,
      schemaVersion: artifact.schema_version,
      kind: artifact.kind,
      uri: artifact.uri,
      title: artifact.title,
      mimeType: artifact.mime_type,
      bodyJson: artifact.body_json,
      ...(artifact.agent_run_id !== null ? { agentRunId: artifact.agent_run_id } : {}),
      ...(artifact.adoption_item_id !== null ? { adoptionItemId: artifact.adoption_item_id } : {}),
    })),
    sessionMemories: sessionMemories.map((memory) => ({
      id: memory.id,
      conversationId: memory.conversation_id,
      payload: parseObjectColumn(memory.payload_json, `session memory ${memory.id}`),
      updatedAt: memory.updated_at,
    })),
    modelRuns: modelRuns.map((run) => ({
      id: run.id,
      textId: run.text_id,
      modelId: run.model_id,
      modelVersion: run.model_version,
      manifestSha256: run.manifest_sha256,
      capability: run.capability,
      params: parseObjectColumn(run.params_json, `model run ${run.id}`),
      mediaId: run.media_id,
      rangeStart: run.range_start,
      rangeEnd: run.range_end,
      startedAt: run.started_at,
      ...(run.finished_at !== null ? { finishedAt: run.finished_at } : {}),
      status: run.status,
      ...(run.error_code !== null ? { errorCode: run.error_code } : {}),
      chunkCount: run.chunk_count,
      acceptedCount: run.accepted_count,
      rejectedCount: run.rejected_count,
      pendingCount: run.pending_count,
    })),
    aiSourceSets: aiSourceSets.map((sourceSet) => ({
      id: sourceSet.id,
      projectId: sourceSet.project_id,
      name: sourceSet.name,
      scope: sourceSet.scope,
      status: sourceSet.status,
      ...(sourceSet.media_id !== null ? { mediaId: sourceSet.media_id } : {}),
      ...(sourceSet.layer_id !== null ? { layerId: sourceSet.layer_id } : {}),
      ...(sourceSet.bound_session_id !== null
        ? { boundSessionId: sourceSet.bound_session_id }
        : {}),
    })),
    notes: notes.map((note) => ({
      id: note.id,
      targetType: note.target_type,
      targetId: note.target_id,
      text: note.text,
    })),
    sourceRecords: sourceRecords.map((source) => ({
      id: source.id,
      textId: source.text_id,
      originalName: source.original_name,
      displayName: source.display_name,
      format: source.format,
      ...(source.media_id !== null ? { mediaId: source.media_id } : {}),
    })),
    audios: audios.map((audio) => ({
      id: audio.id,
      relPath: audio.relpath,
      sha256: audio.sha256,
    })),
    manuscripts,
  };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const [planFile, dest] = process.argv.slice(2);
  const raw = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  applyPlan(
    {
      status: raw.status,
      project: raw.project ?? null,
      speakers: raw.speakers ?? [],
      languages: raw.languages ?? [],
      displayNames: raw.displayNames ?? [],
      aliases: raw.aliases ?? [],
      orthographies: raw.orthographies ?? [],
      sourceRecords: raw.sourceRecords ?? [],
      lexemes: raw.lexemes ?? [],
      phonemes: raw.phonemes ?? [],
      abbreviations: raw.abbreviations ?? [],
      tagDefinitions: raw.tagDefinitions ?? [],
      bibliographicSources: raw.bibliographicSources ?? [],
      locations: raw.locations ?? [],
      grammarDocs: raw.grammarDocs ?? [],
      orthographyBridges: raw.orthographyBridges ?? [],
      customFields: raw.customFields ?? [],
      catalogHistory: raw.catalogHistory ?? [],
      lexemeAssets: raw.lexemeAssets ?? [],
      lexemeAssetLinks: raw.lexemeAssetLinks ?? [],
      structuralRules: raw.structuralRules ?? [],
      conversations: raw.conversations ?? [],
      aiMessages: raw.aiMessages ?? [],
      aiTasks: raw.aiTasks ?? [],
      aiTaskSnapshots: raw.aiTaskSnapshots ?? [],
      projectMemories: raw.projectMemories ?? [],
      agentArtifacts: raw.agentArtifacts ?? [],
      aiSourceSets: raw.aiSourceSets ?? [],
      sessionMemories: raw.sessionMemories ?? [],
      modelRuns: raw.modelRuns ?? [],
      notes: raw.notes ?? [],
      audios: raw.audios.map((audio) => ({ ...audio, bytes: Buffer.from(audio.bytes, 'base64') })),
      manuscripts: raw.manuscripts,
    },
    dest,
  );
  process.stdout.write(JSON.stringify(readProject(dest)));
}
