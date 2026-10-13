/**
 * 主库 schema 版本账本（rev5 8.2 / D2 / T57）| Main-DB schema version ledger (rev5 8.2 / D2 / T57)
 *
 * 所有 `version(n)` 声明都登记在这里：Dexie 构造器、分级判断、冻结检查都读同一份数据。
 * - 基线（第一个条目）不带 `tier`，也不带 upgrader。
 * - 之后的每个版本都必须声明 `additive` 或 `rewriting`；没有声明的按 rewriting 处理（8.2）。
 * - rewriting 必须带 upgrader 和合成夹具测试（`fixtureTest`），冻结之后由 schemaFreeze 检查强制。
 * - upgrader 里不调用 WebCrypto，也不调用 fetch（8.2“其他”）；upgrader 放在 `./upgraders/` 下，
 *   由 schemaFreeze 检查静态扫描。
 *
 * Every `version(n)` lives here; the Dexie constructor, tier classification and the freeze check
 * read the same data. Versions after the baseline must declare a tier (undeclared ⇒ rewriting);
 * rewriting versions need an upgrader plus a synthetic fixture test. Upgraders must not call
 * WebCrypto or fetch.
 */
import type Dexie from 'dexie';
import type { Transaction } from 'dexie';
import { JIEYU_BASELINE_STORES } from '../baselineStores';

export { JIEYU_BASELINE_STORES };

/** 8.2 / D2 分级 | 8.2 / D2 tier */
export type MigrationTier = 'additive' | 'rewriting';

/** Dexie 风格的 store 声明增量：`null` 表示删除该表 | Dexie-style store delta; `null` deletes the store */
export type SchemaStoresDelta = Readonly<Record<string, string | null>>;

export type JieyuSchemaVersion = {
  /** Dexie 版本号（原生版本 = 版本号 × 10）| Dexie version (native = version × 10) */
  version: number;
  /** 相对上一版本的 store 增量；基线为完整声明 | Delta vs the previous version; full spec for the baseline */
  stores: SchemaStoresDelta;
  /** 分级；基线之外缺省按 rewriting | Tier; missing ⇒ rewriting (except the baseline) */
  tier?: MigrationTier;
  /** 内容升级函数（只允许 IDB 操作）| Content upgrader (IDB operations only) */
  upgrade?: (tx: Transaction) => PromiseLike<unknown> | void;
  /** rewriting 版本的合成夹具测试文件（相对仓库根目录）| Synthetic fixture test for rewriting versions */
  fixtureTest?: string;
};

/** 基线版本号（冻结时写进 ADR-0008）| Baseline version (recorded in ADR-0008 at freeze) */
export const JIEYU_SCHEMA_BASELINE_VERSION = 1;

/**
 * 主库版本账本，按版本号升序。冻结点（D14）之前只有基线；切片加字段时直接改基线并重置开发数据。
 * Main-DB ledger in ascending order. Before the freeze point only the baseline exists.
 */
export const JIEYU_SCHEMA_VERSIONS: readonly JieyuSchemaVersion[] = [
  { version: JIEYU_SCHEMA_BASELINE_VERSION, stores: JIEYU_BASELINE_STORES },
];

/** 账本中的最新版本 | Latest version in a ledger */
export function latestSchemaVersion(versions: readonly JieyuSchemaVersion[]): number {
  const last = versions[versions.length - 1];
  if (!last) throw new Error('schema ledger is empty');
  return last.version;
}

/**
 * 须与 `JieyuDexie` 声明的最新 `version(…)` 一致（由账本推出）。
 * Latest declared `version(…)` of `JieyuDexie` (derived from the ledger).
 */
export const JIEYU_DEXIE_TARGET_SCHEMA_VERSION = latestSchemaVersion(JIEYU_SCHEMA_VERSIONS);

/**
 * 账本基本约束：升序、无重复、基线不带 tier / upgrader。违反时抛错（构造期就失败，不会静默打开）。
 * Structural ledger rules: ascending, unique, baseline without tier/upgrader. Throws on violation.
 */
export function assertSchemaLedgerShape(versions: readonly JieyuSchemaVersion[]): void {
  if (versions.length === 0) throw new Error('schema ledger is empty');
  let previous = 0;
  versions.forEach((entry, index) => {
    if (!Number.isInteger(entry.version) || entry.version <= previous) {
      throw new Error(`schema ledger must be strictly ascending integers (at v${entry.version})`);
    }
    if (index === 0 && (entry.tier !== undefined || entry.upgrade !== undefined)) {
      throw new Error('the baseline version must not declare a tier or an upgrader');
    }
    previous = entry.version;
  });
}

/** 把账本应用到 Dexie 实例 | Apply a ledger to a Dexie instance */
export function applyJieyuSchemaVersions(
  dexie: Dexie,
  versions: readonly JieyuSchemaVersion[],
): void {
  assertSchemaLedgerShape(versions);
  for (const entry of versions) {
    const declared = dexie
      .version(entry.version)
      .stores(entry.stores as Record<string, string | null>);
    if (entry.upgrade) declared.upgrade(entry.upgrade);
  }
}

/** 某版本的累计 store 声明（`null` 删除已应用）| Cumulative store spec at a version */
export function cumulativeStoresAt(
  versions: readonly JieyuSchemaVersion[],
  version: number,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of versions) {
    if (entry.version > version) break;
    for (const [name, spec] of Object.entries(entry.stores)) {
      if (spec === null) delete result[name];
      else result[name] = spec;
    }
  }
  return result;
}
