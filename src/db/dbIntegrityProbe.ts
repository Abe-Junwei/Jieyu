import { getDb, type JieyuDatabase } from './engine';

export type DbIntegrityProbeResult = { ok: true } | { ok: false; reason: string };

export type DbIntegrityReferenceIssue = {
  relation: string;
  missingValue: string;
  sourceIds: string[];
};

export type DbIntegrityReferenceDiagnostic = {
  relation: string;
  sourceTable: string;
  sourceField: string;
  targetTable: string;
  checkedCount: number;
  missingReferences: DbIntegrityReferenceIssue[];
};

export type DbIntegrityDeepDiagnosticReport = {
  ok: boolean;
  mode: 'sample' | 'full';
  checkedAt: string;
  tableCount: number;
  references: DbIntegrityReferenceDiagnostic[];
  failures: string[];
};

type DbIntegrityReferenceRule = {
  relation: string;
  sourceTable: 'layer_units' | 'tier_definitions' | 'tier_annotations' | 'layer_unit_contents';
  sourceField: 'textId' | 'tierId' | 'unitId';
  targetTable: 'texts' | 'tier_definitions' | 'layer_units';
};

type ReferenceSourceRow = { id?: unknown } & Record<string, unknown>;

const CORE_REFERENCE_RULES: DbIntegrityReferenceRule[] = [
  {
    relation: 'layer_units.textId -> texts.id',
    sourceTable: 'layer_units',
    sourceField: 'textId',
    targetTable: 'texts',
  },
  {
    relation: 'tier_definitions.textId -> texts.id',
    sourceTable: 'tier_definitions',
    sourceField: 'textId',
    targetTable: 'texts',
  },
  {
    relation: 'tier_annotations.tierId -> tier_definitions.id',
    sourceTable: 'tier_annotations',
    sourceField: 'tierId',
    targetTable: 'tier_definitions',
  },
  {
    relation: 'layer_unit_contents.unitId -> layer_units.id',
    sourceTable: 'layer_unit_contents',
    sourceField: 'unitId',
    targetTable: 'layer_units',
  },
];

function toReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return 'unknown-error';
}

/**
 * 轻量探测关键表是否可读（F-2）。失败不修改数据库。
 * Lightweight read probe for critical tables (F-2). Does not mutate the database.
 */
export async function probeJieyuDatabaseIntegrity(
  database: JieyuDatabase,
): Promise<DbIntegrityProbeResult> {
  try {
    const tables = database.dexie.tables;
    await database.dexie.transaction('r', tables, async () => {
      for (const table of tables) {
        await table.limit(1).toArray();
      }
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: toReason(error) };
  }
}

const SPOT_CHECK_SAMPLE_SIZE = 20;

async function readReferenceRows(
  db: JieyuDatabase,
  tableName: DbIntegrityReferenceRule['sourceTable'],
  sampleSize?: number,
): Promise<ReferenceSourceRow[]> {
  const table = db.dexie[tableName];
  if (typeof sampleSize === 'number') {
    return (await table.limit(sampleSize).toArray()) as unknown as ReferenceSourceRow[];
  }
  return (await table.toArray()) as unknown as ReferenceSourceRow[];
}

function readReferenceValue(row: ReferenceSourceRow, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function checkReferenceRule(
  db: JieyuDatabase,
  rule: DbIntegrityReferenceRule,
  sampleSize?: number,
): Promise<DbIntegrityReferenceDiagnostic> {
  const rows = await readReferenceRows(db, rule.sourceTable, sampleSize);
  const sourceIdsByReference = new Map<string, string[]>();
  for (const row of rows) {
    const referenceValue = readReferenceValue(row, rule.sourceField);
    if (referenceValue === null) continue;
    const sourceId = typeof row.id === 'string' && row.id.length > 0 ? row.id : '<unknown>';
    sourceIdsByReference.set(referenceValue, [
      ...(sourceIdsByReference.get(referenceValue) ?? []),
      sourceId,
    ]);
  }

  const referenceValues = [...sourceIdsByReference.keys()];
  if (referenceValues.length === 0) {
    return {
      relation: rule.relation,
      sourceTable: rule.sourceTable,
      sourceField: rule.sourceField,
      targetTable: rule.targetTable,
      checkedCount: rows.length,
      missingReferences: [],
    };
  }

  const existing = await db.dexie[rule.targetTable]
    .where('id')
    .anyOf(referenceValues)
    .primaryKeys();
  const existingSet = new Set(existing.map((key) => String(key)));
  const missingReferences = referenceValues
    .filter((referenceValue) => !existingSet.has(referenceValue))
    .map((missingValue) => ({
      relation: rule.relation,
      missingValue,
      sourceIds: sourceIdsByReference.get(missingValue) ?? [],
    }));

  return {
    relation: rule.relation,
    sourceTable: rule.sourceTable,
    sourceField: rule.sourceField,
    targetTable: rule.targetTable,
    checkedCount: rows.length,
    missingReferences,
  };
}

async function runReferenceDiagnostics(
  db: JieyuDatabase,
  sampleSize?: number,
): Promise<DbIntegrityReferenceDiagnostic[]> {
  const diagnostics: DbIntegrityReferenceDiagnostic[] = [];
  for (const rule of CORE_REFERENCE_RULES) {
    diagnostics.push(await checkReferenceRule(db, rule, sampleSize));
  }
  return diagnostics;
}

function formatReferenceIssue(issue: DbIntegrityReferenceIssue): string {
  return `Referential integrity violation: ${issue.relation} missing "${issue.missingValue}" referenced by ${issue.sourceIds.join(', ')}`;
}

/**
 * 迁移后引用完整性抽查。
 * 对关键外键关系抽样验证，确保 upgrade hook 没有破坏数据一致性。
 * Post-migration referential-integrity spot-check.
 */
async function checkReferentialIntegritySpotCheck(db: JieyuDatabase): Promise<void> {
  const diagnostics = await runReferenceDiagnostics(db, SPOT_CHECK_SAMPLE_SIZE);
  const firstIssue = diagnostics.flatMap((diagnostic) => diagnostic.missingReferences)[0];
  if (firstIssue) {
    throw new Error(formatReferenceIssue(firstIssue));
  }
}

/**
 * 手动/CI 深度诊断：只读扫描关键表引用关系，full 模式会遍历核心关系的全部源行。
 * Manual/CI deep diagnostics: read-only scan for core referential integrity.
 */
export async function runJieyuDatabaseDeepDiagnostics(
  database: JieyuDatabase,
  options: { sampleSize?: number } = {},
): Promise<DbIntegrityDeepDiagnosticReport> {
  const sampleSize = options.sampleSize;
  const mode = typeof sampleSize === 'number' ? 'sample' : 'full';
  const failures: string[] = [];

  const base = await probeJieyuDatabaseIntegrity(database);
  if (!base.ok) {
    failures.push(base.reason);
    return {
      ok: false,
      mode,
      checkedAt: new Date().toISOString(),
      tableCount: database.dexie.tables.length,
      references: [],
      failures,
    };
  }

  const references = await runReferenceDiagnostics(database, sampleSize);
  for (const diagnostic of references) {
    for (const issue of diagnostic.missingReferences) {
      failures.push(formatReferenceIssue(issue));
    }
  }

  return {
    ok: failures.length === 0,
    mode,
    checkedAt: new Date().toISOString(),
    tableCount: database.dexie.tables.length,
    references,
    failures,
  };
}

/**
 * 迁移后 spot-check：在基础可读性探测之上增加引用完整性抽查。
 * Post-migration spot-check: adds referential-integrity sampling on top of the base read probe.
 */
export async function spotCheckJieyuDatabaseAfterMigration(
  database: JieyuDatabase,
): Promise<DbIntegrityProbeResult> {
  const base = await probeJieyuDatabaseIntegrity(database);
  if (!base.ok) {
    return base;
  }
  try {
    await checkReferentialIntegritySpotCheck(database);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: toReason(error) };
  }
}

/** `getDb()` 单例上的轻量健康读（F-2 / ARCH-4）| Lightweight read health on the `getDb()` singleton. */
export async function jieyuDatabaseSingletonHealthCheck(): Promise<DbIntegrityProbeResult> {
  return probeJieyuDatabaseIntegrity(await getDb());
}
