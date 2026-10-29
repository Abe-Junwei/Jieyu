import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { writeRequiredFieldValues } from './customFields';
import { readStringMap } from './stringMap';

type SqliteDatabase = InstanceType<typeof Database>;

const SOURCE_TYPES = [
  'built-in-generated',
  'built-in-reviewed',
  'user-override',
  'user-custom',
] as const;

const ALIAS_TYPES = ['search', 'display', 'legacy', 'short', 'variant'] as const;

export interface ProjectLanguageAlias {
  alias: string;
  normalizedAlias: string;
  aliasType: string;
}

export interface ProjectLanguageName {
  locale: string;
  value: string;
  isPreferred: boolean;
}

export interface ProjectLanguage {
  id: string;
  name: Record<string, string>;
  iso6393: string | null;
  glottocode: string | null;
  sourceType: string;
  names: ProjectLanguageName[];
  aliases: ProjectLanguageAlias[];
  history: string[];
}

export interface LanguageEnsure {
  name: Record<string, string>;
  sourceType: string;
  iso6393?: string;
  glottocode?: string;
  aliases?: { alias: string; aliasType: string }[];
  fieldValues?: Record<string, unknown>;
}

export interface OrthographyCreate {
  languageId: string;
  name: Record<string, string>;
  scriptTag: string;
  sourceType: string;
  fieldValues?: Record<string, unknown>;
}

export interface ProjectOrthography {
  id: string;
  languageId: string;
  name: Record<string, string>;
  scriptTag: string;
  sourceType: string;
}

export interface BridgeCreate {
  sourceOrthographyId: string;
  targetOrthographyId: string;
  engine: string;
  rules: Record<string, unknown>;
  sampleInput?: string;
  sampleOutput?: string;
  sampleCases?: { input: string; expectedOutput?: string }[];
  fieldValues?: Record<string, unknown>;
}

export interface ProjectBridge {
  id: string;
  sourceOrthographyId: string;
  targetOrthographyId: string;
  engine: string;
  rules: Record<string, unknown>;
  sampleInput: string | null;
  sampleOutput: string | null;
  sampleCases: { input: string; expectedOutput?: string }[];
}

export function ensureProjectLanguage(db: SqliteDatabase, input: LanguageEnsure): ProjectLanguage {
  const name = requiredName(input.name);
  const sourceType = requiredSource(input.sourceType);
  const iso6393 = optionalCode(input.iso6393, /^[a-z]{3}$/, 'iso6393');
  const glottocode = optionalCode(input.glottocode, /^[a-z]{4}\d{4}$/, 'glottocode');
  if (iso6393 === null && glottocode === null) throw new Error('language identity is missing');
  const aliases = (input.aliases ?? []).map(normalizeAlias);
  const write = db.transaction(() => {
    const existing = findLanguage(db, iso6393, glottocode);
    if (existing) return existing;
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO languages (
        id, name_json, iso6393, glottocode, source_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, JSON.stringify(name), iso6393, glottocode, sourceType, now, now);
    const entries = Object.entries(name);
    entries.forEach(([locale, value], index) => {
      db.prepare(
        `INSERT INTO language_display_names (
          id, language_id, locale, role, value, is_preferred, source_type, created_at, updated_at
        ) VALUES (?, ?, ?, 'preferred', ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), id, locale, value, index === 0 ? 1 : 0, sourceType, now, now);
    });
    for (const alias of aliases) {
      db.prepare(
        `INSERT INTO language_aliases (
          id, language_id, alias, normalized_alias, alias_type, source_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        id,
        alias.alias,
        alias.normalizedAlias,
        alias.aliasType,
        sourceType,
        now,
        now,
      );
    }
    db.prepare(
      `INSERT INTO language_catalog_history (id, language_id, action, summary, created_at)
       VALUES (?, ?, 'create', 'created', ?)`,
    ).run(randomUUID(), id, now);
    writeRequiredFieldValues(db, 'language', id, input.fieldValues);
    const created = getProjectLanguage(db, id);
    if (!created) throw new Error('language readback failed');
    return created;
  });
  return write();
}

export function getProjectLanguage(db: SqliteDatabase, id: string): ProjectLanguage | null {
  const row = db
    .prepare('SELECT id, name_json, iso6393, glottocode, source_type FROM languages WHERE id = ?')
    .get(id) as
    | {
        id: string;
        name_json: string;
        iso6393: string | null;
        glottocode: string | null;
        source_type: string;
      }
    | undefined;
  if (!row) return null;
  const names = db
    .prepare(
      `SELECT locale, value, is_preferred FROM language_display_names
       WHERE language_id = ? ORDER BY is_preferred DESC, locale`,
    )
    .all(id) as { locale: string; value: string; is_preferred: number }[];
  const aliases = db
    .prepare(
      `SELECT alias, normalized_alias, alias_type FROM language_aliases
       WHERE language_id = ? ORDER BY normalized_alias`,
    )
    .all(id) as { alias: string; normalized_alias: string; alias_type: string }[];
  const history = db
    .prepare(
      'SELECT action FROM language_catalog_history WHERE language_id = ? ORDER BY created_at, id',
    )
    .all(id) as { action: string }[];
  return {
    id: row.id,
    name: readStringMap(row.name_json),
    iso6393: row.iso6393,
    glottocode: row.glottocode,
    sourceType: row.source_type,
    names: names.map((item) => ({
      locale: item.locale,
      value: item.value,
      isPreferred: item.is_preferred === 1,
    })),
    aliases: aliases.map((item) => ({
      alias: item.alias,
      normalizedAlias: item.normalized_alias,
      aliasType: item.alias_type,
    })),
    history: history.map((item) => item.action),
  };
}

export function createOrthography(
  db: SqliteDatabase,
  input: OrthographyCreate,
): ProjectOrthography {
  const name = requiredName(input.name);
  const sourceType = requiredSource(input.sourceType);
  const scriptTag = input.scriptTag.trim();
  if (scriptTag.length === 0) throw new Error('script tag is empty');
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO orthographies (
        id, language_id, name_json, script_tag, catalog_metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.languageId,
      JSON.stringify(name),
      scriptTag,
      JSON.stringify({ catalogSource: sourceType }),
      now,
      now,
    );
    writeRequiredFieldValues(db, 'orthography', id, input.fieldValues);
    return readOrthography(db, id);
  });
  return write();
}

export function getBridge(db: SqliteDatabase, id: string): ProjectBridge | null {
  const row = db.prepare('SELECT id FROM orthography_bridges WHERE id = ?').get(id) as
    { id: string } | undefined;
  return row ? readBridge(db, id) : null;
}

export function createBridge(db: SqliteDatabase, input: BridgeCreate): ProjectBridge {
  if (!['table-map', 'icu-rule', 'manual'].includes(input.engine)) {
    throw new Error('bridge engine is invalid');
  }
  if (typeof input.rules !== 'object' || input.rules === null || Array.isArray(input.rules)) {
    throw new Error('bridge rules must be an object');
  }
  const sampleCases = input.sampleCases ?? [];
  if (!Array.isArray(sampleCases)) throw new Error('bridge samples must be a list');
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO orthography_bridges (
        id, source_orthography_id, target_orthography_id, engine, rules_json,
        sample_input, sample_output, sample_cases_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.sourceOrthographyId,
      input.targetOrthographyId,
      input.engine,
      JSON.stringify(input.rules),
      input.sampleInput ?? null,
      input.sampleOutput ?? null,
      JSON.stringify(sampleCases),
      now,
      now,
    );
    writeRequiredFieldValues(db, 'orthography-bridge', id, input.fieldValues);
    return readBridge(db, id);
  });
  return write();
}

export function listProjectLanguages(db: SqliteDatabase): ProjectLanguage[] {
  const rows = db.prepare('SELECT id FROM languages ORDER BY id').all() as { id: string }[];
  return rows.map((row) => {
    const language = getProjectLanguage(db, row.id);
    if (!language) throw new Error('language readback failed');
    return language;
  });
}

export function updateProjectLanguage(
  db: SqliteDatabase,
  input: { id: string; locale: string; value: string },
  afterWrite?: () => void,
): ProjectLanguage {
  const locale = input.locale.trim();
  const value = input.value.trim();
  if (locale.length === 0 || value.length === 0) throw new Error('language name is empty');
  const existing = getProjectLanguage(db, input.id);
  if (!existing) throw new Error('language is missing');
  if (existing.name[locale] === value) return existing;
  const write = db.transaction(() => {
    const name = { ...existing.name, [locale]: value };
    const now = new Date().toISOString();
    db.prepare('UPDATE languages SET name_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(name),
      now,
      existing.id,
    );
    db.prepare('DELETE FROM language_display_names WHERE language_id = ?').run(existing.id);
    const preferred = existing.names.find((item) => item.isPreferred)?.locale ?? locale;
    const preferredLocale = preferred in name ? preferred : locale;
    for (const [itemLocale, itemValue] of Object.entries(name)) {
      db.prepare(
        `INSERT INTO language_display_names (
          id, language_id, locale, role, value, is_preferred, source_type, created_at, updated_at
        ) VALUES (?, ?, ?, 'preferred', ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        existing.id,
        itemLocale,
        itemValue,
        itemLocale === preferredLocale ? 1 : 0,
        existing.sourceType,
        now,
        now,
      );
    }
    db.prepare(
      `INSERT INTO language_catalog_history (id, language_id, action, summary, created_at)
       VALUES (?, ?, 'update', 'updated', ?)`,
    ).run(randomUUID(), existing.id, now);
    afterWrite?.();
    const stored = getProjectLanguage(db, existing.id);
    if (!stored || stored.name[locale] !== value || !stored.history.includes('update')) {
      throw new Error('language update readback failed');
    }
    return stored;
  });
  return write();
}

export function listOrthographies(db: SqliteDatabase, languageId: string): ProjectOrthography[] {
  if (!getProjectLanguage(db, languageId)) throw new Error('language is missing');
  const rows = db
    .prepare('SELECT id FROM orthographies WHERE language_id = ? ORDER BY id')
    .all(languageId) as { id: string }[];
  return rows.map((row) => readOrthography(db, row.id));
}

export function updateOrthography(
  db: SqliteDatabase,
  input: { id: string; scriptTag: string },
  afterWrite?: () => void,
): ProjectOrthography {
  const scriptTag = input.scriptTag.trim();
  if (scriptTag.length === 0) throw new Error('script tag is empty');
  const write = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM orthographies WHERE id = ?').get(input.id) as
      { id: string } | undefined;
    if (!existing) throw new Error('orthography is missing');
    const current = readOrthography(db, existing.id);
    if (current.scriptTag === scriptTag) return current;
    const now = new Date().toISOString();
    db.prepare('UPDATE orthographies SET script_tag = ?, updated_at = ? WHERE id = ?').run(
      scriptTag,
      now,
      existing.id,
    );
    afterWrite?.();
    const stored = readOrthography(db, existing.id);
    if (
      stored.scriptTag !== scriptTag ||
      JSON.stringify(stored.name) !== JSON.stringify(current.name)
    ) {
      throw new Error('orthography update readback failed');
    }
    return stored;
  });
  return write();
}

export function listBridges(db: SqliteDatabase): ProjectBridge[] {
  const rows = db.prepare('SELECT id FROM orthography_bridges ORDER BY id').all() as {
    id: string;
  }[];
  return rows.map((row) => readBridge(db, row.id));
}

export function updateBridge(
  db: SqliteDatabase,
  input: { id: string; rules: Record<string, unknown> },
  afterWrite?: () => void,
): ProjectBridge {
  if (typeof input.rules !== 'object' || input.rules === null || Array.isArray(input.rules)) {
    throw new Error('bridge rules must be an object');
  }
  const write = db.transaction(() => {
    const existing = getBridge(db, input.id);
    if (!existing) throw new Error('bridge is missing');
    if (JSON.stringify(existing.rules) === JSON.stringify(input.rules)) return existing;
    const now = new Date().toISOString();
    db.prepare('UPDATE orthography_bridges SET rules_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(input.rules),
      now,
      existing.id,
    );
    afterWrite?.();
    const stored = getBridge(db, existing.id);
    if (!stored || JSON.stringify(stored.rules) !== JSON.stringify(input.rules)) {
      throw new Error('bridge update readback failed');
    }
    return stored;
  });
  return write();
}

function findLanguage(
  db: SqliteDatabase,
  iso6393: string | null,
  glottocode: string | null,
): ProjectLanguage | null {
  const byIso = iso6393 === null ? undefined : languageIdBy(db, 'iso6393', iso6393);
  const byGlottocode = glottocode === null ? undefined : languageIdBy(db, 'glottocode', glottocode);
  if (byIso !== undefined && byGlottocode !== undefined && byIso !== byGlottocode) {
    throw new Error('language identity conflicts');
  }
  const id = byIso ?? byGlottocode;
  return id === undefined ? null : getProjectLanguage(db, id);
}

function languageIdBy(
  db: SqliteDatabase,
  column: 'iso6393' | 'glottocode',
  value: string,
): string | undefined {
  const row = db.prepare(`SELECT id FROM languages WHERE ${column} = ?`).get(value) as
    { id: string } | undefined;
  return row?.id;
}

function readOrthography(db: SqliteDatabase, id: string): ProjectOrthography {
  const row = db
    .prepare(
      `SELECT id, language_id, name_json, script_tag, catalog_metadata_json
       FROM orthographies WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        language_id: string;
        name_json: string;
        script_tag: string;
        catalog_metadata_json: string;
      }
    | undefined;
  if (!row) throw new Error('orthography readback failed');
  const metadata = JSON.parse(row.catalog_metadata_json) as { catalogSource?: unknown };
  if (typeof metadata.catalogSource !== 'string') throw new Error('orthography source is missing');
  return {
    id: row.id,
    languageId: row.language_id,
    name: readStringMap(row.name_json),
    scriptTag: row.script_tag,
    sourceType: metadata.catalogSource,
  };
}

function readBridge(db: SqliteDatabase, id: string): ProjectBridge {
  const row = db
    .prepare(
      `SELECT id, source_orthography_id, target_orthography_id, engine, rules_json,
              sample_input, sample_output, sample_cases_json
       FROM orthography_bridges WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        source_orthography_id: string;
        target_orthography_id: string;
        engine: string;
        rules_json: string;
        sample_input: string | null;
        sample_output: string | null;
        sample_cases_json: string;
      }
    | undefined;
  if (!row) throw new Error('bridge readback failed');
  return {
    id: row.id,
    sourceOrthographyId: row.source_orthography_id,
    targetOrthographyId: row.target_orthography_id,
    engine: row.engine,
    rules: JSON.parse(row.rules_json) as Record<string, unknown>,
    sampleInput: row.sample_input,
    sampleOutput: row.sample_output,
    sampleCases: JSON.parse(row.sample_cases_json) as { input: string; expectedOutput?: string }[],
  };
}

function requiredName(name: Record<string, string>): Record<string, string> {
  const entries = Object.entries(name).filter(([, value]) => value.trim().length > 0);
  if (entries.length === 0) throw new Error('language name is empty');
  return Object.fromEntries(entries.map(([key, value]) => [key, value.trim()]));
}

function requiredSource(sourceType: string): string {
  if (!(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    throw new Error('language source is invalid');
  }
  return sourceType;
}

function optionalCode(value: string | undefined, pattern: RegExp, name: string): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) throw new Error(`${name} is empty`);
  if (!pattern.test(trimmed)) throw new Error(`${name} is invalid`);
  return trimmed;
}

function normalizeAlias(input: { alias: string; aliasType: string }): ProjectLanguageAlias {
  const alias = input.alias.trim();
  if (alias.length === 0) throw new Error('alias is empty');
  if (!(ALIAS_TYPES as readonly string[]).includes(input.aliasType)) {
    throw new Error('alias type is invalid');
  }
  return {
    alias,
    normalizedAlias: alias.normalize('NFKC').toLowerCase(),
    aliasType: input.aliasType,
  };
}
