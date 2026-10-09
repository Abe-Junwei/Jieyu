/**
 * schema 冻结检查（rev5 8.2 / D14 / T57）| Schema freeze check (rev5 8.2 / D14 / T57)
 *
 * 冻结点之后：
 * - 已冻结版本（写进 `schemaFreeze.record.json` 的版本）的 store 声明、tier、是否带 upgrader 都不能再改，也不能删除；
 * - 冻结时必须存在冻结记录；
 * 任何时候：
 * - 基线之后的每个版本都必须声明 tier；
 * - 声明 additive 但结构上需要改写（删表、改主键、加唯一索引、删/改索引、带 upgrader）视为违规；
 * - rewriting 版本必须带 upgrader 和存在的合成夹具测试文件；
 * - upgrader 不调用 WebCrypto / fetch / XMLHttpRequest / 动态 import。
 *
 * 这里只有纯函数，读文件由调用方（CI 测试）注入。
 * Pure functions only; file access is injected by the caller (the CI test).
 */
import { classifySchemaStep } from './migrationTier';
import {
  JIEYU_SCHEMA_BASELINE_VERSION,
  type JieyuSchemaVersion,
  type MigrationTier,
} from './schemaVersions';

export const SCHEMA_FREEZE_RECORD_PATH = 'src/db/migration/schemaFreeze.record.json';
export const SCHEMA_FREEZE_RECORD_FORMAT_VERSION = 1;

export type FrozenSchemaVersion = {
  version: number;
  stores: Record<string, string | null>;
  tier: MigrationTier | null;
  hasUpgrade: boolean;
};

export type SchemaFreezeRecord = {
  formatVersion: number;
  baselineVersion: number;
  frozenAt: string;
  versions: FrozenSchemaVersion[];
};

export type SchemaFreezeViolationKind =
  | 'missing-freeze-record'
  | 'invalid-freeze-record'
  | 'baseline-mismatch'
  | 'frozen-version-removed'
  | 'frozen-version-changed'
  | 'undeclared-tier'
  | 'additive-requires-rewrite'
  | 'rewriting-missing-upgrader'
  | 'rewriting-missing-fixture-test'
  | 'forbidden-api-in-upgrader';

export type SchemaFreezeViolation = {
  kind: SchemaFreezeViolationKind;
  version?: number;
  message: string;
};

/** upgrader 里禁止的 API | APIs upgraders must not call */
export const FORBIDDEN_UPGRADER_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'crypto.subtle', pattern: /\bcrypto\s*\.\s*subtle\b/ },
  { name: 'fetch', pattern: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { name: 'dynamic import', pattern: /\bimport\s*\(/ },
];

/** 规范化 store 声明：去空白、索引排序（主键保持在首位）| Normalise a store spec (keep primary key first) */
export function normalizeStoreSpec(spec: string | null): string | null {
  if (spec === null) return null;
  const parts = spec
    .split(',')
    .map((part) => part.replace(/\s+/g, ''))
    .filter((part) => part.length > 0);
  const [primary = '', ...indexes] = parts;
  return [primary, ...indexes.sort()].join(',');
}

function normalizeStores(
  stores: Readonly<Record<string, string | null>>,
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const name of Object.keys(stores).sort()) {
    result[name] = normalizeStoreSpec(stores[name] ?? null);
  }
  return result;
}

/** 账本条目 → 冻结形式 | Ledger entry → frozen form */
export function toFrozenSchemaVersion(entry: JieyuSchemaVersion): FrozenSchemaVersion {
  return {
    version: entry.version,
    stores: normalizeStores(entry.stores),
    tier: entry.tier ?? null,
    hasUpgrade: entry.upgrade !== undefined,
  };
}

/**
 * 生成（或扩展）冻结记录：已有记录中的版本原样保留，只追加新版本；已有版本被改动时拒绝。
 * Build (or extend) a freeze record: existing entries are kept verbatim, new versions appended.
 * Refuses when a frozen version changed.
 */
export function buildSchemaFreezeRecord(
  versions: readonly JieyuSchemaVersion[],
  existing: SchemaFreezeRecord | null,
  now: Date = new Date(),
): SchemaFreezeRecord {
  if (existing) {
    const drift = checkFrozenVersionsUnchanged(versions, existing);
    if (drift.length > 0) {
      throw new Error(
        `refusing to rewrite the freeze record: ${drift.map((item) => item.message).join('; ')}`,
      );
    }
  }
  const known = new Set(existing?.versions.map((item) => item.version) ?? []);
  return {
    formatVersion: SCHEMA_FREEZE_RECORD_FORMAT_VERSION,
    baselineVersion: existing?.baselineVersion ?? JIEYU_SCHEMA_BASELINE_VERSION,
    frozenAt: existing?.frozenAt ?? now.toISOString(),
    versions: [
      ...(existing?.versions ?? []),
      ...versions.filter((entry) => !known.has(entry.version)).map(toFrozenSchemaVersion),
    ],
  };
}

/** 解析冻结记录（结构不对返回 null）| Parse a freeze record (null when malformed) */
export function parseSchemaFreezeRecord(raw: unknown): SchemaFreezeRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Partial<SchemaFreezeRecord>;
  if (record.formatVersion !== SCHEMA_FREEZE_RECORD_FORMAT_VERSION) return null;
  if (typeof record.baselineVersion !== 'number' || typeof record.frozenAt !== 'string')
    return null;
  if (!Array.isArray(record.versions)) return null;
  const valid = record.versions.every(
    (item: Partial<FrozenSchemaVersion> | null) =>
      item !== null &&
      typeof item === 'object' &&
      typeof item.version === 'number' &&
      typeof item.stores === 'object' &&
      item.stores !== null &&
      typeof item.hasUpgrade === 'boolean' &&
      (item.tier === null || item.tier === 'additive' || item.tier === 'rewriting'),
  );
  return valid ? (record as SchemaFreezeRecord) : null;
}

function checkFrozenVersionsUnchanged(
  versions: readonly JieyuSchemaVersion[],
  record: SchemaFreezeRecord,
): SchemaFreezeViolation[] {
  const violations: SchemaFreezeViolation[] = [];
  for (const frozen of record.versions) {
    const current = versions.find((entry) => entry.version === frozen.version);
    if (!current) {
      violations.push({
        kind: 'frozen-version-removed',
        version: frozen.version,
        message: `frozen schema v${frozen.version} was removed from the ledger`,
      });
      continue;
    }
    if (JSON.stringify(toFrozenSchemaVersion(current)) !== JSON.stringify(frozen)) {
      violations.push({
        kind: 'frozen-version-changed',
        version: frozen.version,
        message: `frozen schema v${frozen.version} changed; add a new version instead`,
      });
    }
  }
  return violations;
}

export type SchemaFreezeCheckInput = {
  versions: readonly JieyuSchemaVersion[];
  frozen: boolean;
  /** 冻结记录原始 JSON（文件不存在为 undefined）| Raw freeze record JSON (undefined when absent) */
  recordJson: unknown;
  /** 仓库内文件是否存在 | Whether a repo-relative file exists */
  fileExists: (repoRelativePath: string) => boolean;
  /** upgrader 源文件（`upgraders/` 目录）内容，用于静态扫描 | Upgrader source files for the static scan */
  upgraderSources?: readonly { path: string; source: string }[];
  baselineVersion?: number;
};

/** 运行全部冻结规则 | Run every freeze rule */
export function checkSchemaFreeze(input: SchemaFreezeCheckInput): SchemaFreezeViolation[] {
  const violations: SchemaFreezeViolation[] = [];
  const baselineVersion = input.baselineVersion ?? JIEYU_SCHEMA_BASELINE_VERSION;

  if (input.recordJson === undefined) {
    if (input.frozen) {
      violations.push({
        kind: 'missing-freeze-record',
        message: `data is frozen but ${SCHEMA_FREEZE_RECORD_PATH} is missing (run npm run schema:freeze-record)`,
      });
    }
  } else {
    const record = parseSchemaFreezeRecord(input.recordJson);
    if (!record) {
      violations.push({
        kind: 'invalid-freeze-record',
        message: `${SCHEMA_FREEZE_RECORD_PATH} is malformed`,
      });
    } else {
      if (record.baselineVersion !== baselineVersion) {
        violations.push({
          kind: 'baseline-mismatch',
          message: `freeze record baseline v${record.baselineVersion} ≠ ledger baseline v${baselineVersion}`,
        });
      }
      violations.push(...checkFrozenVersionsUnchanged(input.versions, record));
    }
  }

  for (const entry of input.versions) {
    if (entry.version <= baselineVersion) continue;
    if (entry.tier === undefined) {
      violations.push({
        kind: 'undeclared-tier',
        version: entry.version,
        message: `schema v${entry.version} must declare tier 'additive' or 'rewriting'`,
      });
    }
    if (entry.tier === 'additive') {
      const step = classifySchemaStep(input.versions, entry.version);
      if (step.effective === 'rewriting') {
        violations.push({
          kind: 'additive-requires-rewrite',
          version: entry.version,
          message: `schema v${entry.version} is declared additive but needs a rewrite (${step.reasons
            .map((reason) => reason.kind)
            .join(', ')})`,
        });
      }
    }
    if (entry.tier === 'rewriting' || entry.tier === undefined) {
      if (!entry.upgrade) {
        violations.push({
          kind: 'rewriting-missing-upgrader',
          version: entry.version,
          message: `rewriting schema v${entry.version} needs an upgrader`,
        });
      }
      const fixture = entry.fixtureTest;
      if (fixture === undefined || !/\.test\.tsx?$/.test(fixture) || !input.fileExists(fixture)) {
        violations.push({
          kind: 'rewriting-missing-fixture-test',
          version: entry.version,
          message: `rewriting schema v${entry.version} needs an existing synthetic fixture test (fixtureTest)`,
        });
      }
    }
    if (entry.upgrade) {
      violations.push(
        ...scanUpgraderSource(
          `schema v${entry.version} upgrader`,
          entry.upgrade.toString(),
          entry.version,
        ),
      );
    }
  }

  for (const file of input.upgraderSources ?? []) {
    violations.push(...scanUpgraderSource(file.path, file.source));
  }
  return violations;
}

function scanUpgraderSource(
  label: string,
  source: string,
  version?: number,
): SchemaFreezeViolation[] {
  return FORBIDDEN_UPGRADER_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(
    ({ name }) => ({
      kind: 'forbidden-api-in-upgrader' as const,
      ...(version !== undefined ? { version } : {}),
      message: `${label} must not use ${name}`,
    }),
  );
}
