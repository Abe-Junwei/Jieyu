/**
 * 迁移分级（rev5 8.2 / D2 / T40）| Migration tiering (rev5 8.2 / D2 / T40)
 *
 * - 分级按 `(from, to]` 区间整体判断：区间内任何一步是 rewriting，整个区间就是 rewriting。
 * - 没有声明 tier 的版本按 rewriting 处理。
 * - 即使声明为 additive，只要结构差异里出现“新增唯一索引、修改主键、删除表”，或者带 upgrader，
 *   也按 rewriting 处理（保守取更严的一级）。删除索引、索引改为 unique / multiEntry 同样算 rewriting：
 *   additive 只允许“新增表”和“新增非唯一索引”。
 *
 * Tiers are decided over the whole `(from, to]` range; one rewriting step makes the range rewriting.
 * Undeclared ⇒ rewriting. A declared-additive step is still rewriting when its structural diff adds
 * a unique index, changes a primary key, deletes a store/index, or it carries an upgrader.
 */
import { cumulativeStoresAt, type JieyuSchemaVersion, type MigrationTier } from './schemaVersions';

export type TierReasonKind =
  | 'undeclared'
  | 'declared-rewriting'
  | 'upgrader'
  | 'store-deleted'
  | 'primary-key-changed'
  | 'unique-index-added'
  | 'index-removed'
  | 'index-changed';

export type TierReason = { version: number; kind: TierReasonKind; store?: string; index?: string };

export type TierStep = {
  version: number;
  declared: MigrationTier | undefined;
  effective: MigrationTier;
  reasons: TierReason[];
};

export type UpgradeRangeClassification = {
  from: number;
  to: number;
  tier: MigrationTier;
  steps: TierStep[];
};

type ParsedIndex = { name: string; unique: boolean; multi: boolean; auto: boolean };

/** 解析 Dexie 的一段 store 声明 | Parse one Dexie store spec */
export function parseDexieStoreSpec(spec: string): {
  primaryKey: ParsedIndex;
  indexes: Map<string, ParsedIndex>;
} {
  const parts = spec
    .split(',')
    .map((part) => part.trim())
    .filter((part, index) => index === 0 || part.length > 0);
  const parse = (raw: string): ParsedIndex => {
    let name = raw;
    let unique = false;
    let multi = false;
    let auto = false;
    for (;;) {
      if (name.startsWith('++')) {
        auto = true;
        name = name.slice(2);
      } else if (name.startsWith('&')) {
        unique = true;
        name = name.slice(1);
      } else if (name.startsWith('*')) {
        multi = true;
        name = name.slice(1);
      } else break;
    }
    return { name, unique, multi, auto };
  };
  const primaryKey = parse(parts[0] ?? '');
  const indexes = new Map<string, ParsedIndex>();
  for (const raw of parts.slice(1)) {
    const parsed = parse(raw);
    indexes.set(parsed.name, parsed);
  }
  return { primaryKey, indexes };
}

function structuralReasons(
  version: number,
  before: Record<string, string>,
  after: Record<string, string>,
): TierReason[] {
  const reasons: TierReason[] = [];
  for (const [store, beforeSpec] of Object.entries(before)) {
    const afterSpec = after[store];
    if (afterSpec === undefined) {
      reasons.push({ version, kind: 'store-deleted', store });
      continue;
    }
    if (afterSpec === beforeSpec) continue;
    const b = parseDexieStoreSpec(beforeSpec);
    const a = parseDexieStoreSpec(afterSpec);
    if (
      a.primaryKey.name !== b.primaryKey.name ||
      a.primaryKey.auto !== b.primaryKey.auto ||
      a.primaryKey.unique !== b.primaryKey.unique ||
      a.primaryKey.multi !== b.primaryKey.multi
    ) {
      reasons.push({ version, kind: 'primary-key-changed', store });
    }
    for (const [name, idx] of b.indexes) {
      const next = a.indexes.get(name);
      if (!next) reasons.push({ version, kind: 'index-removed', store, index: name });
      else if (next.unique !== idx.unique || next.multi !== idx.multi) {
        reasons.push({
          version,
          kind: next.unique && !idx.unique ? 'unique-index-added' : 'index-changed',
          store,
          index: name,
        });
      }
    }
    for (const [name, idx] of a.indexes) {
      if (!b.indexes.has(name) && idx.unique) {
        reasons.push({ version, kind: 'unique-index-added', store, index: name });
      }
    }
  }
  // 新表里的唯一索引不改写已有数据，属于 additive | Unique indexes on brand-new stores rewrite nothing
  return reasons;
}

/** 单个版本的有效分级 | Effective tier of one version step */
export function classifySchemaStep(
  versions: readonly JieyuSchemaVersion[],
  version: number,
): TierStep {
  const entry = versions.find((candidate) => candidate.version === version);
  if (!entry) throw new Error(`schema version v${version} is not declared`);
  const previousVersion = versions
    .filter((candidate) => candidate.version < version)
    .pop()?.version;
  const reasons: TierReason[] = [];
  if (entry.tier === undefined) reasons.push({ version, kind: 'undeclared' });
  if (entry.tier === 'rewriting') reasons.push({ version, kind: 'declared-rewriting' });
  if (entry.upgrade) reasons.push({ version, kind: 'upgrader' });
  if (previousVersion !== undefined) {
    reasons.push(
      ...structuralReasons(
        version,
        cumulativeStoresAt(versions, previousVersion),
        cumulativeStoresAt(versions, version),
      ),
    );
  }
  return {
    version,
    declared: entry.tier,
    effective: reasons.length > 0 ? 'rewriting' : 'additive',
    reasons,
  };
}

/**
 * 按 `(from, to]` 区间整体分级。`from` 可以是 0（全新安装：不需要迁移，视为 additive）。
 * Classify the `(from, to]` range as a whole. `from = 0` (fresh install) is additive.
 */
export function classifyUpgradeRange(
  versions: readonly JieyuSchemaVersion[],
  from: number,
  to: number,
): UpgradeRangeClassification {
  if (to < from) throw new Error(`cannot classify a downgrade (v${from} → v${to})`);
  if (from === 0) return { from, to, tier: 'additive', steps: [] };
  if (!versions.some((entry) => entry.version === from)) {
    // 已安装的版本不在账本里：无从判断，按 rewriting | Unknown installed version ⇒ rewriting
    return {
      from,
      to,
      tier: 'rewriting',
      steps: [
        {
          version: from,
          declared: undefined,
          effective: 'rewriting',
          reasons: [{ version: from, kind: 'undeclared' }],
        },
      ],
    };
  }
  const steps = versions
    .filter((entry) => entry.version > from && entry.version <= to)
    .map((entry) => classifySchemaStep(versions, entry.version));
  const tier: MigrationTier = steps.some((step) => step.effective === 'rewriting')
    ? 'rewriting'
    : 'additive';
  return { from, to, tier, steps };
}
