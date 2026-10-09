/**
 * 合成迁移夹具（rev5 T38–T40）：一个与主库无关的小 schema，用来锁定版本检测、分级和闸门行为。
 * Synthetic migration fixtures (rev5 T38–T40): a tiny schema unrelated to the main DB.
 */
import type { JieyuSchemaVersion } from '../schemaVersions';

export const SYNTH_V1: JieyuSchemaVersion = {
  version: 1,
  stores: { items: 'id, name', notes: 'id, itemId' },
};

/** v2 additive：新增索引和新表 | v2 additive: new index and new store */
export const SYNTH_V2_ADDITIVE: JieyuSchemaVersion = {
  version: 2,
  tier: 'additive',
  stores: { items: 'id, name, createdAt', tags: 'id, &label' },
};

/** v2 rewriting：改写每一行 | v2 rewriting: rewrites every row */
export const SYNTH_V2_REWRITING: JieyuSchemaVersion = {
  version: 2,
  tier: 'rewriting',
  stores: { items: 'id, name, displayName' },
  fixtureTest: 'src/db/migration/migrationGate.test.ts',
  upgrade: async (tx) => {
    await tx
      .table('items')
      .toCollection()
      .modify((row: { name?: string; displayName?: string }) => {
        row.displayName = (row.name ?? '').toUpperCase();
      });
  },
};

/** v3 没有声明 tier | v3 without a declared tier */
export const SYNTH_V3_UNDECLARED: JieyuSchemaVersion = {
  version: 3,
  stores: { labels: 'id' },
};

export const SYNTH_LEDGER_ADDITIVE: readonly JieyuSchemaVersion[] = [SYNTH_V1, SYNTH_V2_ADDITIVE];
export const SYNTH_LEDGER_REWRITING: readonly JieyuSchemaVersion[] = [SYNTH_V1, SYNTH_V2_REWRITING];
